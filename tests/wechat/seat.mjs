// Bring the live table up the way a player does after a launch: the table
// waits for the hero to take a seat, then deals. `finished` also folds and
// fast-finishes that hand for suites that need a settled real hand.
export async function seatAtTable(mini, { finished = false, timeout = 45000 } = {}) {
  let page = await mini.currentPage();
  if (page?.path !== 'pages/table/table') {
    await mini.reLaunch('/pages/table/table');
    page = await mini.currentPage();
  }
  const deadline = Date.now() + timeout;
  for (;;) {
    page = await mini.currentPage();
    const data = (await page?.data()) || {};
    if (data.tableReady && !data.waitingForSeat && !data.dealing && !finished) return page;
    if (data.tableReady && data.waitingForSeat)
      await mini.evaluate(() => getCurrentPages()[getCurrentPages().length - 1].joinTable());
    else if (data.tableReady && finished && !data.dealing) {
      if (data.done) return page;
      await mini.evaluate(() => {
        const table = getCurrentPages()[getCurrentPages().length - 1],
          game = table._controller.getGame();
        if (game.phase === 'playing' && game.actor === 0) table._controller.action('fold');
        else if (game.players[0].folded) table.finishHand();
      });
    }
    if (Date.now() > deadline) throw Error('The table did not seat the hero in time');
    await page?.waitFor(250);
  }
}
