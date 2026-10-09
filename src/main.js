import './styles/base.css';
import './styles/game.css';
import './styles/review.css';
import './styles/showdown.css';
import './styles/table.css';
import './styles/opponents.css';
import './styles/native.css';
import { preparePlatform } from './platform/native.js';

await preparePlatform();
await import('./ui/table-controller.js');
