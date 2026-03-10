export class Player {
    private _id: string;
    private _color: string;
    private _health: number;
    private _pos: { x: number; y: number; };

    constructor(id: string, color: string, pos: { x: number, y: number }) {
        this._id = id;
        this._color = color;
        this._health = 100;
        this._pos = pos;
    }

    public movePlayer(dx: number, dy: number) {
        this._pos.x += dx;
        this._pos.y += dy;
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

    public get health(): number {
        return this._health;
    }
    public set health(value: number) {
        this._health = value;
    }
    public get pos(): { x: number; y: number; } {
        return this._pos;
    }
    public set pos(value: { x: number; y: number; }) {
        this._pos = value;
    }
}