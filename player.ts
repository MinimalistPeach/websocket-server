type Direction = "up" | "down" | "left" | "right";

export class Player {
  private _id: string;
  private _color: string;
  private _pos: { x: number; y: number };
  private _body: { x: number; y: number }[];
  private _length: number;
  private _speed: number = 1;
  private _direction: string = "";
  private _isReady: boolean = false;

  constructor(
    id: string,
    color: string,
    pos: { x: number; y: number },
    initialLength: number = 5,
  ) {
    this._id = id;
    this._color = color;
    this._pos = pos;
    this._length = initialLength;
    this._body = Array.from({ length: this._length }, () => ({
      x: pos.x,
      y: pos.y,
    }));
  }

  public movePlayer(
    dx: number,
    dy: number,
    boardWidth: number,
    boardHeight: number,
  ): { x: number; y: number }[] {
    const visited: { x: number; y: number }[] = [];
    const margin = 20;
    const step = Math.max(1, Math.floor(this._speed));
    let nextX = this._pos.x;
    let nextY = this._pos.y;

    for (let i = 0; i < step; i++) {
      nextX += dx;
      nextY += dy;

      if (
        nextX < margin ||
        nextX > boardWidth - margin ||
        nextY < margin ||
        nextY > boardHeight - margin
      ) {
        this.applyDamage();
        this.autoTurn(boardWidth, boardHeight);
        this.addBodySegment({ x: this._pos.x, y: this._pos.y });
        return visited;
      }

      this._pos.x = nextX;
      this._pos.y = nextY;
      this.addBodySegment({ x: this._pos.x, y: this._pos.y });
      visited.push({ x: this._pos.x, y: this._pos.y });
    }

    return visited;
  }

  public autoTurn(width: number, height: number) {
    const possibleDirs: Direction[] = [];
    const margin = 20;

    if (this._pos.y > margin) possibleDirs.push("up");
    if (this._pos.y < height - margin) possibleDirs.push("down");
    if (this._pos.x > margin) possibleDirs.push("left");
    if (this._pos.x < width - margin) possibleDirs.push("right");

    const opposite: Record<Direction, Direction> = {
      up: "down",
      down: "up",
      left: "right",
      right: "left",
    };

    const validChoices = possibleDirs.filter(
      (d) => d !== opposite[this._direction as Direction],
    );

    if (validChoices.length > 0) {
      this._direction =
        validChoices[Math.floor(Math.random() * validChoices.length)];
    }
  }

  public addBodySegment(pos: { x: number; y: number }) {
    this._body.unshift({ x: pos.x, y: pos.y });
    while (this._body.length > this._length) {
      this._body.pop();
    }
  }

  public grow(amount: number = 1) {
    this._length += amount;
  }

  public increaseSpeed() {
    this._speed += 1;
  }

  public applyDamage() {
    if (this._length > 2) {
      this._length -= 1;
    }
  }

  public isAlive(): boolean {
    return this._length > 2;
  }

  public getDistanceFromOtherPlayer(other: Player): number {
    const dx = this._pos.x - other.pos.x;
    const dy = this._pos.y - other.pos.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  public get id(): string {
    return this._id;
  }
  public set id(value: string) {
    this._id = value;
  }

  public get color(): string {
    return this._color;
  }
  public set color(value: string) {
    this._color = value;
  }
  public get pos(): { x: number; y: number } {
    return this._pos;
  }
  public set pos(value: { x: number; y: number }) {
    this._pos = value;
  }

  public get body(): { x: number; y: number }[] {
    return this._body;
  }

  public get length(): number {
    return this._length;
  }

  public get direction(): string {
    return this._direction;
  }
  public set direction(value: string) {
    this._direction = value;
  }

  public get speed(): number {
    return this._speed;
  }

  public get isReady(): boolean {
    return this._isReady;
  }

  public set isReady(value: boolean) {
    this._isReady = value;
  }
}
