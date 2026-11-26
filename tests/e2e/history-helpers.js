import { expect } from '@playwright/test';

// Closing a full-screen dialog pops the history entry it held for Back. A
// reload, navigation or Back started before that pop lands can be swallowed
// by it (an aborted or never-loading reload), so wait until the closed dialog
// no longer owns the current entry.
export async function settleDialogBack(page, dialogId) {
  await expect
    .poll(() => page.evaluate(() => history.state?.noirLayer ?? null))
    .not.toBe(`dialog:${dialogId}`);
}
