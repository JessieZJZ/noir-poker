import './styles/base.css';
import './styles/game.css';
import './styles/review.css';
import './styles/showdown.css';
import './styles/table.css';
import './styles/opponents.css';
import './styles/native.css';
import './styles/hint-banner.css';
import './styles/play-viewport.css';
import './styles/controls-layout.css';
import './styles/persona-browser.css';
import './styles/settings-layout.css';
import { preparePlatform } from './platform/native.js';

await preparePlatform();
await import('./ui/table-controller.js');
