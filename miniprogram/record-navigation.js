// Keep native Back meaningful: game -> records -> one replaceable saved hand.
function createRecordNavigation({ api, pages }) {
  let pending = false;
  const route = (page) => String(page?.route || '').replace(/^\//, '');
  const transition = (method, options = {}) => {
    if (pending) return false;
    pending = true;
    api[method]({
      ...options,
      complete() {
        pending = false;
      },
    });
    return true;
  };
  return {
    openRecords({ fail } = {}) {
      if (pending) return false;
      const stack = pages();
      const game = stack.find((page) => route(page) === 'pages/table/table');
      if (game) game._browsingRecords = true;
      const index = stack.findIndex((page) => route(page) === 'pages/records/records');
      if (index >= 0) {
        const delta = stack.length - index - 1;
        return delta ? transition('navigateBack', { delta, fail }) : false;
      }
      return transition('navigateTo', { url: '/pages/records/records', fail });
    },
    openHand(id) {
      const stack = pages();
      return transition(
        route(stack[stack.length - 1]) === 'pages/history/history' ? 'redirectTo' : 'navigateTo',
        { url: `/pages/history/history?id=${encodeURIComponent(id)}` },
      );
    },
    returnToGame() {
      const stack = pages();
      const index = stack.findIndex((page) => route(page) === 'pages/table/table');
      if (index < 0) return transition('reLaunch', { url: '/pages/table/table' });
      const delta = stack.length - index - 1;
      return delta ? transition('navigateBack', { delta }) : false;
    },
  };
}

const navigation = createRecordNavigation({
  api: wx,
  pages: () => getCurrentPages(),
});
module.exports = { ...navigation, createRecordNavigation };
