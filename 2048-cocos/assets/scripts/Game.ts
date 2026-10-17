import {
  _decorator, Node, Component, Label, Sprite, SpriteFrame, UITransform,
  Texture2D, ImageAsset, Color, EventTouch, Vec3, v3, Button, tween, resources,
  EditBox, AudioClip, AudioSource, VideoPlayer, sys, director, tween as _tw
} from 'cc';

const { ccclass } = _decorator;

// ===== 配置 =====
const DIFF: Record<string, number> = { easy: 5, normal: 4, hard: 3 };
const DIFF_LABEL: Record<string, string> = { easy: '5 × 5', normal: '4 × 4', hard: '3 × 3' };
const TILE_IMG = ['tile1', 'tile2', 'tile3', 'tile4', 'tile5', 'tile6', 'tile7', 'tile8'];
const MOVE_MS = 0.13;

// 经典 2048 配色
const C = {
  bg: hex(0xfaf8ef), board: hex(0xbbada0), cell: new Color(238, 228, 218, 90),
  text: hex(0x776e65), btn: hex(0x8f7a66), white: new Color(249, 246, 242, 255),
  tile: [
    hex(0xeee4da), hex(0xede0c8), hex(0xf2b179), hex(0xf59563), hex(0xf67c5f),
    hex(0xf65e3b), hex(0xedcf72), hex(0xedcc61), hex(0xedc850), hex(0xedc53f),
    hex(0xedc22e), hex(0x3c3a32), // index 0=2 ... 11=super
  ],
  neon: hex(0x00f0ff), neonDim: new Color(0, 240, 255, 140), green: hex(0x00ff41),
  gold: hex(0xf3d774),
};
function hex(v: number) { return new Color((v >> 16) & 255, (v >> 8) & 255, v & 255, 255); }
function tileColor(value: number): Color {
  if (value >= 2048) return C.tile[11];
  const idx = Math.max(0, Math.floor(Math.log2(value)) - 1); // 2->0
  return C.tile[Math.min(idx, 11)];
}

// Supabase
const SUPA_URL = 'https://uyatewhlxqjgfeohrxjh.supabase.co';
const SUPA_KEY = 'sb_publishable_JI3_m7J9Pe4XLDb87GQzig_XGK_PGiR';
const SUPA_H: Record<string, string> = {
  'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY,
  'Accept-Profile': 'public', 'Content-Profile': 'public'
};

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
  state: 'login' | 'diff' | 'game' = 'login';
  difficulty = 'normal'; size = 4;
  board: (Tile | null)[][] = [];
  score = 0; best = 0; topTile = 0;
  busy = false; over = false; won = false; keepPlaying = false;
  history: { grid: number[][]; score: number }[] = [];
  nick = '';
  scoreSubmitted = false;
  rankDiff = 'normal'; rankTimer = 0;

  tileFrames: SpriteFrame[] = [];
  loginBgSF: SpriteFrame | null = null;
  loginAudio: AudioClip | null = null;
  mergeAudio: AudioClip | null = null;
  audioSrc: AudioSource | null = null;
  videoPlayer: VideoPlayer | null = null;

  boardRoot: Node | null = null;
  tileRoot: Node | null = null;
  gameUI: Node | null = null;
  loginUI: Node | null = null;
  diffUI: Node | null = null;
  rankUI: Node | null = null;
  overlayUI: Node | null = null;
  rankList: Node | null = null;
  scoreLabel: Label | null = null; bestLabel: Label | null = null;
  undoBtn: Node | null = null;
  cell = 100; gap = 10;
  touchStart: Vec3 | null = null;

  onLoad() { this.start(); }

  async start() {
    await this.loadAsync();
    this.node.on('touch-start', this.onTouchStart, this);
    this.node.on('touch-end', this.onTouchEnd, this);
    this.buildLogin();
    this.setState('login');
    this.startAudio();
  }

  loadAssets() {
    // 同步尝试加载（resources 可能未就绪，用 loadAsync 兜底）
  }
  async loadAsync() {
    for (const n of TILE_IMG) {
      const sf = await new Promise<SpriteFrame | null>((res) =>
        resources.load('tiles/' + n, SpriteFrame, (e, a) => res(e ? null : a)));
      if (sf) this.tileFrames.push(sf);
    }
    this.loginBgSF = await new Promise((res) =>
      resources.load('textures/login_bg', SpriteFrame, (e, a) => res(e ? null : a)));
    this.loginAudio = await new Promise((res) =>
      resources.load('audio/login_music', AudioClip, (e, a) => res(e ? null : a)));
    this.mergeAudio = await new Promise((res) =>
      resources.load('audio/naiwa_original_short5s', AudioClip, (e, a) => res(e ? null : a)));
  }

  // ===== 状态切换 =====
  setState(s: 'login' | 'diff' | 'game') {
    this.state = s;
    if (this.loginUI) this.loginUI.active = s === 'login';
    if (this.diffUI) this.diffUI.active = s === 'diff';
    if (this.gameUI) this.gameUI.active = s === 'game';
  }

  // ===== 登录（cyberpunk）=====
  buildLogin() {
    const root = this.node; const W = root.getComponent(UITransform)!.contentSize.width;
    const H = root.getComponent(UITransform)!.contentSize.height;
    const n = this.cyberPanel('login', W, H); root.addChild(n); this.loginUI = n;

    this.txt('SYSTEM READY', 12, 0, H * 0.28, C.neonDim, n, true);
    const t = this.txt('2048', 84, 0, H * 0.20, C.neon, n); t.getComponent(Label)!.isBold = true;
    this.txt('CYBERPUNK EDITION', 13, 0, H * 0.12, new Color(255, 255, 255, 90), n, true);

    const eb = Node.create('nick'); const et = eb.addComponent(UITransform); et.setContentSize(240, 56);
    const box = eb.addComponent(EditBox);
    box.placeholder = '输入昵称'; box.placeholderLabel = this.makeLabel('输入昵称', 16, C.neonDim);
    box.textLabel = this.makeLabel('', 18, C.neon);
    box.backgroundSpriteFrame = whiteSpriteFrame();
    box.string = this.nick;
    eb.setPosition(0, H * 0.02, 0); n.addChild(eb);
    box.on('editing-did-ended', () => { this.nick = box.string.trim(); try { sys.localStorage.setItem('game2048-nick', this.nick); } catch (e) { } });

    const ln = this.neonBtn('登录', 160, 60, () => this.onLogin()); ln.setPosition(-80, -H * 0.10); n.addChild(ln);
    const rk = this.neonBtn('排行榜', 160, 60, () => this.showRank('login')); rk.setPosition(80, -H * 0.10); n.addChild(rk);
  }
  onLogin() { if (!this.nick) return; if (!this.diffUI) this.buildDiff(); this.setState('diff'); }

  // ===== 难度（cyberpunk）=====
  buildDiff() {
    if (this.diffUI) return;
    const root = this.node; const W = root.getComponent(UITransform)!.contentSize.width;
    const H = root.getComponent(UITransform)!.contentSize.height;
    const n = this.cyberPanel('diff', W, H); root.addChild(n); this.diffUI = n;
    this.txt('SELECT DIFFICULTY', 12, 0, H * 0.30, C.neonDim, n, true);
    this.txt('选择难度', 44, 0, H * 0.22, C.neon, n).getComponent(Label)!.isBold = true;
    let y = H * 0.12;
    for (const d of ['easy', 'normal', 'hard']) {
      const b = this.neonBtn(d === 'easy' ? '简单' : d === 'normal' ? '普通' : '困难', 240, 70, (dd => () => this.onDiff(dd))(d));
      b.setPosition(0, y, 0); n.addChild(b);
      this.txt(DIFF_LABEL[d], 14, 0, y - 46, C.neonDim, b, true);
      y -= 90;
    }
  }
  onDiff(d: string) { this.difficulty = d; this.size = DIFF[d]; this.buildGame(); this.newGame(); this.setState('game'); }

  // ===== 游戏（经典米黄）=====
  buildGame() {
    if (this.gameUI) return;
    const root = this.node; const W = root.getComponent(UITransform)!.contentSize.width;
    const H = root.getComponent(UITransform)!.contentSize.height;
    const n = this.rect(W + 400, H + 400, C.bg); n.setPosition(0, 0, 0); root.addChild(n); this.gameUI = n;
    this.buildGameUI(n, W, H);
  }
  buildGameUI(n: Node, W: number, H: number) {
    // HUD
    this.txt('2048', 48, -W * 0.34, H * 0.36, C.text, n).getComponent(Label)!.isBold = true;
    this.txt('滑动方块，合并数字，冲向 2048！', 13, -W * 0.34, H * 0.325, new Color(119, 110, 101, 200), n).getComponent(UITransform)!.setContentSize(360, 40);
    // score / best 盒子
    const sbox = this.scoreBox(n, '分数', W * 0.22, H * 0.36); this.scoreLabel = sbox;
    this.txt('', 20, 0, 0, C.white, sbox.node).getComponent(UITransform)!.setContentSize(0, 0);
    this.bestBox = this.scoreBox(n, '最佳', W * 0.38, H * 0.36);
    // toolbar
    const ng = this.mkBtn('新游戏', () => this.newGame()); ng.setPosition(-W * 0.36, H * 0.30); n.addChild(ng);
    this.undoBtn = this.mkBtn('撤销', () => this.undo()); this.undoBtn.setPosition(-W * 0.16, H * 0.30); n.addChild(this.undoBtn);
    // board
    this.buildGrid(n);
  }
  bestBox: Label | null = null;

  scoreBox(n: Node, cap: string, x: number, y: number): Label {
    const box = this.rect(80, 54, C.board); box.setPosition(x, y, 0); n.addChild(box);
    const c = this.txt(cap, 12, 0, 12, C.white, box); c.getComponent(UITransform)!.setContentSize(80, 20);
    const v = this.txt('0', 22, 0, -10, C.white, box); v.getComponent(UITransform)!.setContentSize(80, 30);
    return v.getComponent(Label)!;
  }

  buildGrid(n: Node) {
    if (this.boardRoot) this.boardRoot.destroy();
    if (this.tileRoot) this.tileRoot.destroy();
    const W = this.node.getComponent(UITransform)!.contentSize.width;
    this.cell = Math.min(W / (this.size + 1.2), 130);
    const total = this.size * this.cell + (this.size + 1) * this.gap;
    const board = this.rect(total, total, C.board);
    board.setPosition(0, this.node.getComponent(UITransform)!.contentSize.height * 0.02, 0);
    n.addChild(board); this.boardRoot = board;
    this.tileRoot = Node.create('tiles'); board.addChild(this.tileRoot);
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const cell = this.rect(this.cell - this.gap * 0.4, this.cell - this.gap * 0.4, C.cell);
      cell.setPosition(this.px(c), this.py(r), 0); this.boardRoot.addChild(cell);
    }
  }

  // ===== 逻辑（复刻 2048.html）=====
  newGame() {
    if (!this.gameUI) this.buildGame();
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(null));
    this.score = 0; this.topTile = 0; this.over = false; this.won = false; this.keepPlaying = false; this.busy = false; this.history = []; this.scoreSubmitted = false;
    if (this.tileRoot) this.tileRoot.removeAllChildren();
    this.hideOverlay(); this.hideRank(); this.buildGrid(this.gameUI!); this.updateHUD();
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
    const node = Node.create('tile' + value);
    const tr = node.addComponent(UITransform); tr.setContentSize(this.cell - this.gap, this.cell - this.gap); tr.setAnchorPoint(0.5, 0.5);
    const sp = node.addComponent(Sprite); sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.spriteFrame = whiteSpriteFrame(); sp.color = tileColor(value);
    // 随机 tile 纹理叠加
    if (this.tileFrames.length) {
      const tx = Node.create('tex'); tx.addComponent(UITransform).setContentSize(this.cell - this.gap, this.cell - this.gap);
      const ts = tx.addComponent(Sprite); ts.sizeMode = Sprite.SizeMode.CUSTOM;
      ts.spriteFrame = this.tileFrames[Math.floor(Math.random() * this.tileFrames.length)]; ts.color = new Color(255, 255, 255, 255);
      node.addChild(tx); tx.setSiblingIndex(0); sp.node.setSiblingIndex(0); tx.setSiblingIndex(1);
    }
    // 数字
    const len = String(value).length;
    const fs = this.cell * (len <= 2 ? 0.45 : len === 3 ? 0.36 : len === 4 ? 0.28 : 0.22);
    const lbl = Node.create('v'); node.addChild(lbl);
    lbl.addComponent(UITransform).setContentSize(this.cell, this.cell);
    const ll = lbl.addComponent(Label); ll.string = String(value); ll.fontSize = Math.floor(fs); ll.lineHeight = Math.floor(fs * 1.2);
    ll.horizontalAlign = Label.HorizontalAlign.CENTER; ll.verticalAlign = Label.VerticalAlign.CENTER;
    ll.color = Color.WHITE; ll.isBold = true;
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
    this.scheduleOnce(() => this.finishTurn(eaten, merged), MOVE_MS);
  }

  finishTurn(eaten: Tile[], merged: Tile[]) {
    for (const t of eaten) t.node.destroy();
    for (const t of merged) {
      t.merged = false;
      t.node.getChildByPath('v')!.getComponent(Label)!.string = String(t.value);
      t.node.getComponent(Sprite)!.color = tileColor(t.value);
      t.node.setScale(1.1, 1.1, 1); tween(t.node).to(0.1, { scale: v3(1, 1, 1) }).start();
    }
    let gained = 0; for (const t of merged) gained += Math.floor(t.value / 2);
    this.score += gained; if (this.score > this.best) { this.best = this.score; this.saveBest(); }
    this.spawn(true); this.updateHUD(); this.busy = false;
    if (merged.length) this.playMerge();
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
    if (this.scoreLabel) this.scoreLabel.string = String(this.score);
    if (this.bestBox) this.bestBox.string = String(this.best);
    if (this.undoBtn) this.undoBtn.getComponent(Button)!.interactable = this.history.length > 0;
  }
  saveBest() { try { sys.localStorage.setItem('game2048-best', String(this.best)); } catch (e) { } }

  // ===== 排行榜 =====
  async fetchRank() {
    if (!this.rankList) return;
    this.rankList.removeAllChildren();
    try {
      const res = await (globalThis as any).fetch(SUPA_URL + '/rest/v1/scores?select=nickname,score,top_tile&difficulty=eq.' + this.rankDiff + '&order=score.desc&limit=10', { headers: SUPA_H });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      if (!data.length) { this.txt('NO SCORES YET', 14, 0, 0, C.neonDim, this.rankList, true).getComponent(UITransform)!.setContentSize(300, 40); this.rankList.addChild(this.rankList.children[0] as Node); return; }
      let y = 0;
      for (let i = 0; i < data.length; i++) {
        const row = this.rect(360, 46, new Color(0, 240, 255, 12)); row.setPosition(0, y, 0); this.rankList.addChild(row);
        this.txt(String(i + 1), 18, -160, 0, C.neon, row);
        this.txt(String(data[i].nickname || 'ANON').replace(/[<>&"']/g, ''), 14, -40, 0, new Color(255, 255, 255, 200), row).getComponent(UITransform)!.setContentSize(200, 30);
        this.txt(String(data[i].score), 16, 120, 0, C.green, row).getComponent(Label)!.isBold = true;
        this.txt(String(data[i].top_tile || ''), 11, 165, 0, new Color(255, 255, 255, 90), row);
        y -= 54;
      }
    } catch (e) { this.txt('FAILED TO LOAD', 14, 0, 0, hex(0xff0044), this.rankList, true); }
  }
  showRank(from: string) {
    this.hideRank();
    const root = this.node; const W = root.getComponent(UITransform)!.contentSize.width;
    const H = root.getComponent(UITransform)!.contentSize.height;
    const n = this.rect(W + 400, H + 400, new Color(0, 0, 0, 235)); n.setPosition(0, 0, 0); root.addChild(n); this.rankUI = n;
    this.txt('排行榜', 32, 0, H * 0.36, C.neon, n).getComponent(Label)!.isBold = true;
    // tabs
    let tx = -W * 0.24;
    for (const d of ['easy', 'normal', 'hard']) {
      const b = this.neonBtn(d === 'easy' ? '简单' : d === 'normal' ? '普通' : '困难', 90, 46, (dd => () => { this.rankDiff = dd; this.fetchRank(); })(d));
      b.setPosition(tx, H * 0.30); n.addChild(b); tx += 100;
    }
    this.rankList = Node.create('list'); this.rankList.addComponent(UITransform).setContentSize(380, 400); this.rankList.setPosition(0, H * 0.05); n.addChild(this.rankList);
    const cl = this.neonBtn('关闭', 160, 54, () => this.hideRank()); cl.setPosition(0, -H * 0.34); n.addChild(cl);
    this.rankDiff = this.difficulty; this.fetchRank();
    this.startRankTimer();
  }
  hideRank() { if (this.rankUI) { this.rankUI.destroy(); this.rankUI = null; this.rankList = null; } this.stopRankTimer(); }
  startRankTimer() { if (this.rankTimer) return; this.rankTimer = setInterval(() => this.fetchRank(), 3000) as unknown as number; }
  stopRankTimer() { if (this.rankTimer) { clearInterval(this.rankTimer); this.rankTimer = 0; } }

  async submitScore() {
    try {
      const res = await (globalThis as any).fetch(SUPA_URL + '/rest/v1/scores', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, SUPA_H),
        body: JSON.stringify({ nickname: this.nick || 'ANON', score: this.score, top_tile: this.topTile, difficulty: this.difficulty })
      });
      return res.ok;
    } catch (e) { return false; }
  }

  // ===== 结束 overlay =====
  showOverlay(mode: string) {
    this.hideOverlay();
    const W = this.node.getComponent(UITransform)!.contentSize.width;
    const boardH = this.boardRoot?.getComponent(UITransform)!.contentSize.height ?? 400;
    const n = this.rect(boardH, boardH, new Color(13, 13, 13, 235));
    if (this.boardRoot) { const bt = this.node.getComponent(UITransform)!; n.setPosition(0, bt.contentSize.height * 0.02, 0); }
    this.node.addChild(n); this.overlayUI = n;
    // 视频
    if (mode === 'lose') {
      const vv = Node.create('vid'); const vt = vv.addComponent(UITransform); vt.setContentSize(boardH, boardH);
      const vp = vv.addComponent(VideoPlayer);
      vp.resourceType = VideoPlayer.ResourceType.LOCAL;
      vp.clip = 'video/ending.mp4';
      vp.isFullscreen = false; vp.keepAspectRatio = true;
      n.addChild(vv); this.videoPlayer = vp;
      try { vp.play(); } catch (e) { }
    }
    const col = mode === 'win' ? C.gold : C.green;
    this.txt(mode === 'win' ? 'YOU WIN' : 'GAME OVER', 36, 0, 90, col, n).getComponent(Label)!.isBold = true;
    this.txt('SCORE', 14, 0, 20, col, n);
    this.txt(String(this.nick ? this.nick + '  ' + this.score : this.score), 30, 0, -10, col, n).getComponent(Label)!.isBold = true;
    if (mode === 'lose' && !this.scoreSubmitted) {
      const st = this.txt('上传中...', 12, 0, -60, C.neonDim, n);
      this.submitScore().then(ok => { this.scoreSubmitted = true; st.getComponent(Label)!.string = ok ? '分数已上传' : '上传失败'; });
    }
    const cy = -90;
    if (mode === 'win') {
      const k = this.neonBtn('CONTINUE', 130, 50, () => { this.keepPlaying = true; this.hideOverlay(); }); k.setPosition(-80, cy, 0); n.addChild(k);
      const r = this.neonBtn('RESTART', 130, 50, () => this.newGame()); r.setPosition(80, cy, 0); n.addChild(r);
    } else {
      const r = this.neonBtn('RESTART', 130, 50, () => this.newGame()); r.setPosition(-60, cy, 0); n.addChild(r);
      const rk = this.neonBtn('排行榜', 130, 50, () => this.showRank('end')); rk.setPosition(80, cy, 0); n.addChild(rk);
    }
  }
  hideOverlay() {
    if (this.overlayUI) { try { this.videoPlayer && this.videoPlayer.stop(); } catch (e) { } this.overlayUI.destroy(); this.overlayUI = null; this.videoPlayer = null; }
  }

  // ===== 音频 =====
  startAudio() {
    if (!this.loginAudio) return;
    const a = Node.create('audio'); this.node.addChild(a); this.audioSrc = a.addComponent(AudioSource);
    this.audioSrc.volume = 0.6;
  }
  playMerge() { if (this.mergeAudio && this.audioSrc) { const s = Node.create('m'); this.node.addChild(s); const a = s.addComponent(AudioSource); a.clip = this.mergeAudio; a.volume = 0.8; a.playOneShot(this.mergeAudio); this.scheduleOnce(() => s.destroy(), 1.2); } }

  // ===== 触摸 =====
  onTouchStart(e: EventTouch) { this.touchStart = e.touch.getUILocation(); }
  onTouchEnd(e: EventTouch) {
    if (this.state !== 'game') return;
    if (!this.touchStart) return;
    const p = e.touch.getUILocation();
    const dx = p.x - this.touchStart.x, dy = p.y - this.touchStart.y; this.touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }
  touchSetup() {
    this.node.on('touch-start', this.onTouchStart, this);
    this.node.on('touch-end', this.onTouchEnd, this);
  }

  // ===== 工具 =====
  px(c: number) { const s = this.size * this.cell + (this.size - 1) * this.gap; return -s / 2 + this.gap + c * (this.cell + this.gap) + this.cell / 2; }
  py(r: number) { const s = this.size * this.cell + (this.size - 1) * this.gap; return s / 2 - this.gap - r * (this.cell + this.gap) - this.cell / 2; }

  cyberPanel(name: string, W: number, H: number): Node {
    const n = Node.create(name); n.addComponent(UITransform).setContentSize(W, H);
    const bg = this.rect(W + 400, H + 400, new Color(10, 10, 15, 255)); bg.setPosition(0, 0, 0); n.addChild(bg);
    if (this.loginBgSF) { const s = this.rect(W + 400, H + 400, Color.WHITE); s.getComponent(Sprite)!.spriteFrame = this.loginBgSF; s.getComponent(Sprite)!.color = new Color(90, 90, 110, 255); s.setPosition(0, 0, 0); n.addChild(s); }
    return n;
  }
  rect(w: number, h: number, color: Color): Node {
    const n = Node.create('rect');
    const tr = n.addComponent(UITransform); tr.setContentSize(w, h); tr.setAnchorPoint(0.5, 0.5);
    const sp = n.addComponent(Sprite); sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.spriteFrame = whiteSpriteFrame(); sp.color = color;
    return n;
  }
  txt(str: string, size: number, x: number, y: number, color: Color, parent: Node, noLayout = false): Node {
    const n = Node.create('txt');
    const tr = n.addComponent(UITransform); tr.setContentSize(400, size * 1.5); tr.setAnchorPoint(0.5, 0.5);
    const l = n.addComponent(Label); l.string = str; l.fontSize = size; l.lineHeight = Math.floor(size * 1.3);
    l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER;
    l.color = color;
    n.setPosition(x, y, 0);
    if (parent) parent.addChild(n);
    return n;
  }
  makeLabel(str: string, size: number, color: Color) {
    const n = Node.create('lbl');
    const tr = n.addComponent(UITransform); tr.setContentSize(240, size * 1.5);
    const l = n.addComponent(Label); l.string = str; l.fontSize = size; l.lineHeight = Math.floor(size * 1.3);
    l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER; l.color = color;
    return l;
  }
  neonBtn(str: string, w: number, h: number, cb: () => void): Node {
    const n = Node.create('btn' + str);
    const tr = n.addComponent(UITransform); tr.setContentSize(w, h); tr.setAnchorPoint(0.5, 0.5);
    const bg = this.rect(w, h, new Color(0, 0, 0, 100)); n.addChild(bg);
    const frame = this.rect(w + 6, h + 6, new Color(0, 0, 0, 0)); n.addChild(frame); frame.setSiblingIndex(0);
    this.txt(str, Math.floor(h * 0.4), 0, 0, C.neon, n);
    const b = n.addComponent(Button); b.transition = Button.Transition.SCALE; b.target = n; b.normalColor = C.neon;
    n.on('click', cb);
    return n;
  }
  mkBtn(str: string, cb: () => void): Node {
    const n = Node.create('btn' + str);
    const tr = n.addComponent(UITransform); tr.setContentSize(100, 52); tr.setAnchorPoint(0.5, 0.5);
    n.addChild(this.rect(100, 52, C.btn));
    this.txt(str, 18, 0, 0, C.white, n);
    const b = n.addComponent(Button); b.transition = Button.Transition.SCALE; b.target = n;
    n.on('click', cb);
    return n;
  }
}
