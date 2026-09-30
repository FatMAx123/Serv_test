class InputManager{
  constructor(game){this.game=game;this.keys={};
    window.addEventListener('keydown',e=>{
      if (this.game && this.game.inMainMenu) return;
      if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
      this.keys[e.key]=true;
    });
    window.addEventListener('keyup',e=>{this.keys[e.key]=false;});
    window.addEventListener('contextmenu', e => { e.preventDefault(); }, { capture: true });
  }
  isKeyPressed(k){
    if (this.game && this.game.inMainMenu) return false;
    if (window.isSceneEditorActive && window.isSceneEditorActive()) return false;
    return this.keys[k]===true;
  }
}
window.InputManager=InputManager;
window.addEventListener('contextmenu', e => { e.preventDefault(); }, { capture: true });