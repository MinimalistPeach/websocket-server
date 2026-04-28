import { randomUUID } from "node:crypto";

export function getRandomColor(excludedColors: string[] = []) {
    const colors = ['blue', 'green', 'yellow', 'purple'];
    const availableColors = colors.filter((color) => !excludedColors.includes(color));
    const options = availableColors.length > 0 ? availableColors : colors;
    return options[Math.floor(Math.random() * options.length)];
}

export function getSafeApplePosition(
    width: number, 
    height: number, 
    gridSize: number, 
    occupiedPoints: { x: number, y: number }[]
) {
    let newPos: { x: number, y: number }; 
    let isOccupied: boolean;
    let attempts = 0;
    const MAX_ATTEMPTS = 100;

    do {
        newPos = getRandomPosition(width, height, gridSize);
        isOccupied = occupiedPoints.some(p => p.x === newPos.x && p.y === newPos.y);
        attempts++;
    } while (isOccupied && attempts < MAX_ATTEMPTS);

    return newPos;
}

export function getRandomPosition(width: number, height: number, gridSize: number = 40) {
    const cols = Math.floor(width / gridSize);
    const rows = Math.floor(height / gridSize);

    const randomCol = Math.floor(Math.random() * cols);
    const randomRow = Math.floor(Math.random() * rows);

    return {
        x: randomCol * gridSize + gridSize / 2,
        y: randomRow * gridSize + gridSize / 2
    };
}

export function generateUUID(): string {
    return randomUUID();
}