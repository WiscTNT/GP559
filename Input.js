export default class Input {
  constructor() {
    this.keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false };
    
    // Tracks both touch and mouse clicks
    this.activeInputs = { left: false, right: false, up: false };

    this.left = false;
    this.right = false;
    this.up = false;

    this.cooldown = 200;
    this.lastInputTime = 0;

    // Keyboard Listeners
    window.addEventListener('keydown', e => {
      if (this.keys.hasOwnProperty(e.key)) this.keys[e.key] = true;
    });
    window.addEventListener('keyup', e => {
      if (this.keys.hasOwnProperty(e.key)) this.keys[e.key] = false;
    });

    this.createMobileControls();
  }

  createMobileControls() {
    const container = document.createElement('div');
    container.id = 'ui-controls';
    
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 75px)',
      gridGap: '10px',
      zIndex: '1000',
      userSelect: 'none'
    });

    const buttons = [
      { id: 'up', label: '▲', grid: 'span 2' },
      { id: 'left', label: '◀', grid: 'auto' },
      { id: 'right', label: '▶', grid: 'auto' }
    ];

    buttons.forEach(btn => {
      const el = document.createElement('div');
      el.innerText = btn.label;
      
      Object.assign(el.style, {
        width: btn.grid === 'span 2' ? '160px' : '75px',
        height: '75px',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        border: '2px solid white',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '28px',
        color: 'white',
        cursor: 'pointer',
        gridColumn: btn.grid,
        transition: 'background 0.1s'
      });

      // --- Interaction Logic ---
      const startAction = (e) => {
        e.preventDefault();
        this.activeInputs[btn.id] = true;
        el.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
      };

      const stopAction = (e) => {
        e.preventDefault();
        this.activeInputs[btn.id] = false;
        el.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
      };

      // Mouse Events
      el.addEventListener('mousedown', startAction);
      el.addEventListener('mouseup', stopAction);
      el.addEventListener('mouseleave', stopAction); // Stops movement if mouse leaves button area

      // Touch Events
      el.addEventListener('touchstart', startAction);
      el.addEventListener('touchend', stopAction);

      container.appendChild(el);
    });

    document.body.appendChild(container);
  }

  update() {
    const now = Date.now();
    const canMove = now - this.lastInputTime >= this.cooldown;

    // Check Keyboard OR Mouse/Touch Input
    if ((this.keys.ArrowLeft || this.activeInputs.left) && canMove) {
      this.left = true;
      this.lastInputTime = now;
    } else {
      this.left = false;
    }

    if ((this.keys.ArrowRight || this.activeInputs.right) && canMove) {
      this.right = true;
      this.lastInputTime = now;
    } else {
      this.right = false;
    }

    this.up = this.keys.ArrowUp || this.activeInputs.up;
  }
}