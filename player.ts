export class Player {
    private _id: string;
    private _color: string;
    private _pos: { x: number; y: number; };
    private _body: { x: number; y: number; }[];
    private _length: number;

    constructor(id: string, color: string, pos: { x: number, y: number }) {
        this._id = id;
        this._color = color;
        this._pos = pos;
        this._length = 0;
        this._body = [{ x: pos.x, y: pos.y }];
    }

    public movePlayer(dx: number, dy: number) {
        this._pos.x += dx;
        this._pos.y += dy;
        this.addBodySegment(this._pos);
    }

    public addBodySegment(pos: { x: number, y: number }) {
        this._body.unshift({ x: pos.x, y: pos.y });
        if (this._body.length > this._length) {
            this._body.pop();
        }
    }

    public grow() {
        this._length += 1;
    }

    public resetBody() {
        this._body = [{ x: this._pos.x, y: this._pos.y }];
        this._length = 5;
    }

    public applyDamage(): 'died' | 'alive' {
        this._body.pop();
        if (this._body.length === 0) {
            this.resetBody();
            return 'died';
        }
        return 'alive';
    }

    public isAlive(): boolean {
        return this._body.length > 0;
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
    public get pos(): { x: number; y: number; } {
        return this._pos;
    }
    public set pos(value: { x: number; y: number; }) {
        this._pos = value;
    }

    public get body(): { x: number; y: number }[] {
        return this._body;
    }

    public get length(): number {
        return this._length;
    }
}