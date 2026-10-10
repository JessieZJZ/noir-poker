// Mini-program JS engines differ from the desktop V8 used for development.
// Install only built-ins consumed by the shared rule/review modules; modern
// runtimes keep their native implementations.
const define = (target, name, value) => {
  if (typeof target[name] !== 'function')
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
};
define(Array.prototype, 'at', function at(index) {
  const number = Number(index);
  const integer = Number.isNaN(number) ? 0 : Math.trunc(number);
  const offset = integer < 0 ? this.length + integer : integer;
  return offset < 0 || offset >= this.length ? undefined : this[offset];
});
define(Array.prototype, 'findLast', function findLast(predicate, receiver) {
  if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
  for (let index = this.length - 1; index >= 0; index--)
    if (predicate.call(receiver, this[index], index, this)) return this[index];
  return undefined;
});
define(Array.prototype, 'flatMap', function flatMap(mapper, receiver) {
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');
  const output = [];
  for (let index = 0; index < this.length; index++) {
    if (!(index in this)) continue;
    const mapped = mapper.call(receiver, this[index], index, this);
    if (Array.isArray(mapped)) {
      for (let nested = 0; nested < mapped.length; nested++)
        if (nested in mapped) output.push(mapped[nested]);
    } else output.push(mapped);
  }
  return output;
});
define(Object, 'hasOwn', (object, property) =>
  Object.prototype.hasOwnProperty.call(object, property),
);
define(Object, 'fromEntries', (entries) => {
  const result = {};
  for (const entry of entries)
    Object.defineProperty(result, entry[0], {
      value: entry[1],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  return result;
});
