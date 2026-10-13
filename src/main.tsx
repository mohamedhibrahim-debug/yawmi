import { render } from 'preact';
import { App } from './ui/App';
import './styles.css';

// Keep Arabic right-to-left even when the page is embedded in a host skeleton.
document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';

render(<App />, document.getElementById('app')!);
