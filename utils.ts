export function getRandomColor() {
    const colors = ['red', 'blue', 'green', 'yellow', 'purple'];
    return colors[Math.floor(Math.random() * colors.length)];
}

export function getRandomPosition(width: number, height: number, margin: number = 20) {
    const maxX = width - margin;
    const maxY = height - margin;
    return {
        x: Math.floor(Math.random() * maxX),
        y: Math.floor(Math.random() * maxY)
    };
}