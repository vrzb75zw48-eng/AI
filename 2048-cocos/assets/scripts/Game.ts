import {
  _decorator, Node, Component, Label, Sprite, SpriteFrame, UITransform,
  Texture2D, ImageAsset, Color, EventTouch, Vec3, v3, Button, tween, resources
} from 'cc';

const { ccclass } = _decorator;

// ===== 配置 =====
const DIFF: Record<string, number> = { easy: 5, normal: 4, hard: 3 };
const TILE_IMG = ['tile1', 'tile2', 'tile3', 'tile4', 'tile5', 'tile6', 'tile7', 'tile8'];
const BG_COLOR = new Color(51, 51, 51, 255);
const CELL_COLOR = new Color(82, 80, 78, 255);

interface Tile { node: Node; r: number; c: number; value: number; merged?: boolean; }

let _whiteSF: SpriteFrame | null = null;
function whiteSpriteFrame(): SpriteFrame {
  if (_whiteSF) return _whiteSF;
  const img = new ImageAsset(new Uint8Array([255, 255, 255, 255]));
  const tex = new Texture2D(); tex.image = img;
  const sf = new SpriteFrame(); sf.texture = tex;
  _whiteSF = sf; return sf;
}

@ccclass('Game')
export class Game extends Component {
  size = 4;
  difficulty = 'normal';
  board: (Tile | null)[][] = [];
  score = 0; best = 0;
  busy = false; over = false; won = false; keepPlaying = false;
  history: { grid: number[][]; score: number }[] = [];

  cell = 100; gap = 10;
  tileFrames: SpriteFrame[] = [];
  boardRoot: Node | null = null;
  tileRoot: Node | null = null;
  scoreLabel: Label | null = null;
  bestLabel: Label | null = null;
  overlayNode: Node | null = null;
  diffBtns: { node: Node; d: string }[] = [];
  touchStart: Vec3 | null = null;

  onLoad() { this.start(); }

  async start() {
    for (const n of TILE_IMG) {
      const sf = await new Promise<SpriteFrame>((res) =>
        this.resourcesLoad(n, res));
      if (sf) this.tileFrames.push(sf);
    }
    this.buildUI();
    this.newGame();
  }

  resourcesLoad(name: string, cb: (sf: SpriteFrame | null) => void) {
    resources.load('tiles/' + name, SpriteFrame, (e, a) => cb(e ? null : a));
  }

  // ===== UI =====
  buildUI() {
    const root = this.node;
    const st = root.getComponent(UITransform)!;
    const W = st.contentSize.width, H = st.contentSize.height;

    const bg = this.rect(W + 500, H + 500, BG_COLOR); bg.setPosition(0, 0, 0); root.addChild(bg);
    this.scoreLabel = this.text('SCORE 0', 42, 0, H * 0.40); root.addChild(this.scoreLabel.node);
    (this.scoreLabel.node.getComponent(UITransform) as UITransform).setContentSize(500, 60);
    this.bestLabel = this.text('BEST 0', 30, 0, H * 0.355); root.addChild(this.bestLabel.node);
    (this.bestLabel.node.getComponent(UITransform) as UITransform).setContentSize(500, 50);

    const y = H * 0.44;
    const mk = (label: string, d: string) => {
      const t = this.text(label, 26, 0, 0); (t.getComponent(UITransform) as UITransform).setContentSize(90, 50);
      const b = this.btn(t, () => this.setDifficulty(d));
      root.addChild(b); this.diffBtns.push({ node: b, d });
    };
    mk('简单', 'easy'); mk('普通', 'normal'); mk('困难', 'hard');
    this.diffBtns[0].node.setPosition(-W * 0.26, y);
    this.diffBtns[1].node.setPosition(0, y);
    this.diffBtns[2].node.setPosition(W * 0.26, y);

    const ng = this.text('新游戏', 26, 0, 0); (ng.getComponent(UITransform) as UITransform).setContentSize(120, 50);
    const ngBtn = this.btn(ng, () => this.newGame()); ngBtn.setPosition(0, y - 80); root.addChild(ngBtn);

    this.buildGrid();
    root.on('touch-start', this.onTouchStart, this);
    root.on('touch-end', this.onTouchEnd, this);
  }

  setDifficulty(d: string) { this.difficulty = d; this.size = DIFF[d]; this.newGame(); }

  buildGrid() {
    const W = this.node.getComponent(UITransform)!.contentSize.width;
    this.cell = Math.min(W / (this.size + 1.2), 130);
    if (this.boardRoot) this.boardRoot.destroy();
    if (this.tileRoot) this.tileRoot.destroy();
    const total = this.size * this.cell + (this.size + 1) * this.gap;
    this.boardRoot = new Node('grid');
    this.boardRoot.addComponent(UITransform).setContentSize(total, total);
    this.boardRoot.setPosition(0, this.node.getComponent(UITransform)!.contentSize.height * 0.06, 0);
    this.node.addChild(this.boardRoot);
    this.tileRoot = new Node('tiles'); this.node.addChild(this.tileRoot);
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const cell = this.rect(this.cell - this.gap * 0.4, this.cell - this.gap * 0.4, CELL_COLOR);
      cell.setPosition(this.px(c), this.py(r), 0);
      this.boardRoot.addChild(cell);
    }
  }
  px(c: number) { const s = this.size * this.cell + (this.size - 1) * this.gap; return -s / 2 + this.gap + c * (this.cell + this.gap) + this.cell / 2; }
  py(r: number) { const s = this.size * this.cell + (this.size - 1) * this.gap; return s / 2 - this.gap - r * (this.cell + this.gap) - this.cell / 2; }

  // ===== 逻辑 =====
  newGame() {
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(null));
    this.score = 0; this.over = false; this.won = false; this.keepPlaying = false; this.busy = false; this.history = [];
    if (this.tileRoot) this.tileRoot.removeAllChildren();
    this.hideOverlay(); this.buildGrid(); this.updateHUD();
    this.spawn(true); this.spawn(true);
  }

  spawn(anim = true) {
    const empty: [number, number][] = [];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) if (!this.board[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    this.board[r][c] = this.mkTile(r, c, Math.random() < 0.9 ? 2 : 4, anim);
  }

  mkTile(r: number, c: number, value: number, anim: boolean): Tile {
    const node = new Node('tile' + value);
    const tr = node.addComponent(UITransform); tr.setContentSize(this.cell - this.gap, this.cell - this.gap); tr.setAnchorPoint(0.5, 0.5);
    const sp = node.addComponent(Sprite); sp.sizeMode = Sprite.SizeMode.CUSTOM;
    if (this.tileFrames.length) sp.spriteFrame = this.tileFrames[Math.floor(Math.random() * this.tileFrames.length)];
    else sp.spriteFrame = whiteSpriteFrame();
    const lbl = new Node('v'); node.addChild(lbl);
    const lt = lbl.addComponent(UITransform); lt.setContentSize(this.cell, this.cell); lt.setAnchorPoint(0.5, 0.5);
    const ll = lbl.addComponent(Label); ll.string = String(value);
    ll.fontSize = Math.floor(this.cell * 0.42); ll.lineHeight = Math.floor(this.cell * 0.55);
    ll.horizontalAlign = Label.HorizontalAlign.CENTER; ll.verticalAlign = Label.VerticalAlign.CENTER;
    ll.color = new Color(42, 42, 42, 255);
    node.setPosition(this.px(c), this.py(r), 0);
    this.tileRoot!.addChild(node);
    if (anim) { node.setScale(0, 0, 1); tween(node).to(0.12, { scale: v3(1, 1, 1) }).start(); }
    return { node, r, c, value };
  }

  canMove() {
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const t = this.board[r][c]; if (!t) return true;
      if (c + 1 < this.size && this.board[r][c + 1]?.value === t.value) return true;
      if (r + 1 < this.size && this.board[r + 1][c]?.value === t.value) return true;
    }
    return false;
  }

  move(dir: 'up' | 'down' | 'left' | 'right') {
    if (this.busy || this.over) return;
    const V: Record<string, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    const v = V[dir];
    const idx = Array.from({ length: this.size }, (_, i) => i);
    const rowOrder = v[0] === 1 ? idx.slice().reverse() : idx;
    const colOrder = v[1] === 1 ? idx.slice().reverse() : idx;
    const snapshot = { grid: this.board.map(row => row.map(t => (t ? t.value : 0))), score: this.score };
    const eaten: Tile[] = []; const merged: Tile[] = []; let moved = false;
    for (const r of rowOrder) for (const c of colOrder) {
      const tile = this.board[r][c]; if (!tile) continue;
      let tr = r, tc = c, target: Tile | null = null;
      for (; ;) {
        const nr = tr + v[0], nc = tc + v[1];
        if (nr < 0 || nr >= this.size || nc < 0 || nc >= this.size) break;
        const o = this.board[nr][nc];
        if (!o) { tr = nr; tc = nc; continue; }
        if (o.value === tile.value && !o.merged) { tr = nr; tc = nc; target = o; }
        break;
      }
      if (tr === r && tc === c) continue;
      this.board[r][c] = null;
      if (target) { target.merged = true; target.value *= 2; eaten.push(tile); merged.push(target); }
      else this.board[tr][tc] = tile;
      tile.r = tr; tile.c = tc; moved = true;
    }
    if (!moved) return;
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const t = this.board[r][c]; if (t) t.node.setPosition(this.px(c), this.py(r), 0);
    }
    this.history.push(snapshot); if (this.history.length > 50) this.history.shift();
    this.busy = true;
    this.scheduleOnce(() => this.finishTurn(eaten, merged), 0.13);
  }

  finishTurn(eaten: Tile[], merged: Tile[]) {
    for (const t of eaten) t.node.destroy();
    for (const t of merged) {
      t.merged = false;
      t.node.getChildByPath('v')!.getComponent(Label)!.string = String(t.value);
      t.node.setScale(0.7, 0.7, 1); tween(t.node).to(0.1, { scale: v3(1, 1, 1) }).start();
    }
    let gained = 0; for (const t of merged) gained += Math.floor(t.value / 2);
    this.score += gained; if (this.score > this.best) { this.best = this.score; this.saveBest(); }
    this.spawn(true); this.updateHUD(); this.busy = false;
    if (merged.some(t => t.value === 2048) && !this.won && !this.keepPlaying) { this.won = true; this.showOverlay('win'); }
    else if (!this.canMove()) { this.over = true; this.showOverlay('lose'); }
  }

  undo() {
    if (this.busy || !this.history.length) return;
    const snap = this.history.pop()!;
    this.tileRoot!.removeAllChildren();
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(null));
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const val = snap.grid[r][c]; if (val) this.board[r][c] = this.mkTile(r, c, val, false);
    }
    this.score = snap.score; this.over = false; this.hideOverlay(); this.updateHUD();
  }

  updateHUD() {
    this.scoreLabel!.string = 'SCORE ' + this.score;
    this.bestLabel!.string = 'BEST ' + this.best;
  }
  saveBest() { try { (globalThis as any).localStorage?.setItem('game2048-best', String(this.best)); } catch (e) { } }

  // ===== overlay =====
  showOverlay(mode: string) {
    this.hideOverlay();
    const W = this.node.getComponent(UITransform)!.contentSize.width;
    const panel = this.rect(W * 0.85, 300, new Color(40, 40, 40, 230));
    panel.setPosition(0, 0, 0); this.node.addChild(panel);
    const msg = this.text(mode === 'win' ? 'YOU WIN' : 'GAME OVER', 48, 0, 70); panel.addChild(msg);
    const sc = this.text(String(this.score), 38, 0, 0); panel.addChild(sc);
    const b = this.text(mode === 'win' ? '继续' : '新游戏', 26, 0, -80);
    const bb = this.btn(b, () => { if (mode === 'win') { this.keepPlaying = true; this.hideOverlay(); } else this.newGame(); });
    panel.addChild(bb);
    this.overlayNode = panel;
  }
  hideOverlay() { if (this.overlayNode) { this.overlayNode.destroy(); this.overlayNode = null; } }

  // ===== 触摸 =====
  onTouchStart(e: EventTouch) { this.touchStart = e.touch.getUILocation(); }
  onTouchEnd(e: EventTouch) {
    if (!this.touchStart) return;
    const p = e.touch.getUILocation();
    const dx = p.x - this.touchStart.x, dy = p.y - this.touchStart.y;
    this.touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  // ===== 工具 =====
  rect(w: number, h: number, color: Color): Node {
    const n = new Node('rect');
    const tr = n.addComponent(UITransform); tr.setContentSize(w, h); tr.setAnchorPoint(0.5, 0.5);
    const sp = n.addComponent(Sprite); sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.spriteFrame = whiteSpriteFrame(); sp.color = color;
    return n;
  }
  text(str: string, size: number, x: number, y: number): Node {
    const n = new Node('txt');
    const tr = n.addComponent(UITransform); tr.setContentSize(300, size * 1.5); tr.setAnchorPoint(0.5, 0.5);
    const l = n.addComponent(Label); l.string = str; l.fontSize = size; l.lineHeight = Math.floor(size * 1.3);
    l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER;
    l.color = new Color(255, 255, 255, 255);
    n.setPosition(x, y, 0);
    return n;
  }
  btn(labelNode: Node, cb: () => void): Node {
    const st = labelNode.getComponent(UITransform)!;
    const b = new Node('btn');
    const tr = b.addComponent(UITransform); tr.setContentSize(st.contentSize.width, st.contentSize.height); tr.setAnchorPoint(0.5, 0.5);
    const bg = this.rect(st.contentSize.width, st.contentSize.height, new Color(23, 160, 160, 255));
    b.addChild(bg);
    labelNode.setPosition(0, 0, 0); b.addChild(labelNode);
    b.getComponent(Button) || b.addComponent(Button);
    b.on('click', cb);
    return b;
  }
}
