// import logo from './logo.svg';
import './App.css';
import './Game.js';
import Game from './Game.js';
import image from './2021-hot-fast-ball.jpg';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={image} className="App-logo" alt="logo" />
        <Game />
      </header>
    </div>
  );
}

export default App;
