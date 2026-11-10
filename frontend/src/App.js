// import logo from './logo.svg';
import './App.css';
import './Game.js';
import Game from './Game.js';
import baseball from './2021-hot-fast-ball.jpg';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <Game />
        <img className="App-baseball" src={baseball} alt="Spinning baseball" />
      </header>
    </div>
  );
}

export default App;
