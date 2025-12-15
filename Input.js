export default class Input {
  constructor() {
    // Tracks physical key state
    this.keys = {
      ArrowLeft: false,
      ArrowRight: false,
      ArrowUp: false
    };

    // Public flags for the Player class to read
    this.left = false;
    this.right = false;
    this.up = false;

    this.cooldown = 200; 
    this.lastInputTime = 0;

    window.addEventListener('keydown', e => {
      if (this.keys.hasOwnProperty(e.key)) {
        this.keys[e.key] = true;
      }
    });

    window.addEventListener('keyup', e => {
      if (this.keys.hasOwnProperty(e.key)) {
        this.keys[e.key] = false;
      }
    });
  }

  // CALL THIS AT THE START OF YOUR FRAME/UPDATE LOOP
  update() {
    const now = Date.now();
    const canMove = now - this.lastInputTime >= this.cooldown;

    // Handle Left Lane Swap
    if (this.keys.ArrowLeft && canMove) {
      this.left = true;
      this.lastInputTime = now;
    } else {
      this.left = false;
    }

    // Handle Right Lane Swap
    if (this.keys.ArrowRight && canMove) {
      this.right = true;
      this.lastInputTime = now;
    } else {
      this.right = false;
    }

    // Handle Up (Continuous - no cooldown)
    this.up = this.keys.ArrowUp;
  }
}