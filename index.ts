import path from 'path';
import fs from 'fs';
import inquirer from 'inquirer';
import cliProgress, { Presets } from 'cli-progress';

const createMakeRequest =
  (instanceUrl: string, accessToken: string) =>
  async <T = any>(path: string, params: Record<string, any> = {}) => {
    const body = JSON.stringify({
      ...params,
      i: accessToken,
    });

    const response = await fetch(`${instanceUrl}/api/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    return response.json() as T;
  };

type RequestFn = ReturnType<typeof createMakeRequest>;

interface Folder {
  id: string;
  name: string;
  path?: string;
}

interface File {
  id: string;
  name: string;
  comment: string | null;
}

const getFolders = async (makeRequest: RequestFn, parent?: Folder) => {
  const topPath = parent
    ? parent.path
      ? `${parent.path} > `
      : `${parent.name} > `
    : '';

  const folders = (
    await makeRequest<Folder[]>('drive/folders', {
      folderId: parent?.id,
    })
  ).map((folder) => ({ ...folder, path: `${topPath}${folder.name}` }));

  const subFolders = await Promise.all(
    folders.map((folder) => getFolders(makeRequest, folder))
  );

  return [...folders, ...subFolders.flatMap((f) => f)];
};

const findAttachmentsFolder = async (
  makeRequest: RequestFn,
  folders: Folder[],
  attachmentFilename: string
) => {
  for (let folder of folders) {
    const matchingFiles = await makeRequest<File[]>('drive/files/find', {
      name: attachmentFilename,
      folderId: folder.id,
    });
    if (matchingFiles.length > 0) {
      return folder;
    }
  }
};

const updateFile = async (
  makeRequest: RequestFn,
  folder: Folder,
  filename: string,
  altText: string
) => {
  const files = await makeRequest<File[]>('drive/files/find', {
    name: filename,
    folderId: folder.id,
  });

  const fileId = files[0].id;

  await makeRequest('drive/files/update', {
    fileId,
    comment: altText,
  });
};

const run = async () => {
  const answers = await inquirer.prompt([
    { name: 'instance', message: 'Enter the url of your instance:' },
    { name: 'accessToken', message: 'Enter your access token:' },
    { name: 'outboxPath', message: 'Enter the path to your outbox.json:' },
  ]);

  const { instance, accessToken, outboxPath } = answers;

  const normalisedInstance =
    instance.startsWith('https://') || instance.startsWith('http://')
      ? instance
      : `https://${instance}`;

  const resolvedOutboxPath = path.resolve(outboxPath);
  if (!fs.existsSync(outboxPath)) {
    console.log(`Couldn't find "${resolvedOutboxPath}", is the path correct?`);
    process.exit(1);
  }

  const makeRequest = createMakeRequest(normalisedInstance, accessToken);

  const outboxContents = fs.readFileSync(path.resolve(outboxPath), 'utf-8');
  const outbox = JSON.parse(outboxContents);

  const attachments = outbox.orderedItems
    .filter(
      (post) => !!post.object.attachment && post.object.attachment.length > 0
    )
    .flatMap((post) => post.object.attachment)
    .map((attachment) => {
      const filenameIndex = attachment.url.lastIndexOf('/');
      const filename = attachment.url.slice(filenameIndex + 1);

      return {
        filename,
        altText: attachment.name,
      };
    });

  const count = attachments.length;
  const unit = count === 1 ? 'attachment' : 'attachments';

  console.log(`Found ${count} ${unit} to update in sharkey.`);

  const folders = await getFolders(makeRequest);

  const attachmentsFolder = await findAttachmentsFolder(
    makeRequest,
    folders,
    attachments[0].filename
  );

  if (!attachmentsFolder) {
    console.error("Couldn't find a drive folder containing the attachments.");
    process.exit(1);
  }

  const { proceed } = await inquirer.prompt([
    {
      name: 'proceed',
      type: 'confirm',
      message: `It looks like the images are in your drive folder "${attachmentsFolder.path}". Does that look right?`,
    },
  ]);

  if (!proceed) {
    process.exit(0);
  }

  console.log('Updating images...');

  const progressBar = new cliProgress.SingleBar({}, Presets.shades_classic);
  progressBar.start(count, 0);

  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i];

    await updateFile(
      makeRequest,
      attachmentsFolder,
      attachment.filename,
      attachment.altText
    );

    progressBar.increment();
  }

  progressBar.stop();
  console.log('Done! Your images should now have alt text in sharkey.');
};

run();
