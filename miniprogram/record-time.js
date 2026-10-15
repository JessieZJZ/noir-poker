const recordStartTime = (timestamp) => {
  const date = new Date(timestamp);
  const two = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
};
module.exports = { recordStartTime };
