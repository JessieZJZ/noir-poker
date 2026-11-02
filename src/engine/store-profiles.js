import characters from '../data/characters.json' with { type: 'json' };
export const STORE_PROFILE_NAMES = Object.fromEntries(
  Object.entries(characters.characters).map(([id, p]) => [id, p.name]),
);
export const STORE_PROFILE_NOTICE =
  '电脑角色的策略和情绪均为游戏设定，介绍描述常见倾向，不保证每次采用相同操作。';
export const STORE_PROFILE_TITLE = '关于训练风格';
