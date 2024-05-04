function createFigure8Animation(canvas) {
    const ctx = canvas.getContext("2d");

    canvas.width = 80;
    canvas.height = 50;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const planetRadius = 3;
    const figure8Width = 75;
    const figure8Height = 50;

    function drawFigure8() {
        ctx.beginPath();

        for (let i = 0; i <= Math.PI * 2; i += 0.01) {
            const x = centerX + (figure8Width / 2) * Math.sin(i);
            const y = centerY + (figure8Height / 2) * Math.sin(i) * Math.cos(i);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.strokeStyle = "black";
        ctx.stroke();
    }

    function drawPlanet() {
        const angle = performance.now() * 0.002;
        const x = centerX + (figure8Width / 2) * Math.sin(angle);
        const y =
            centerY + (figure8Height / 2) * Math.sin(angle) * Math.cos(angle);

        ctx.beginPath();
        ctx.arc(x, y, planetRadius, 0, Math.PI * 2);
        ctx.fillStyle = "black";
        ctx.fill();
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawFigure8();
        drawPlanet();

        requestAnimationFrame(animate);
    }

    animate();
}

const figure8CanvasElements = document.getElementsByClassName("figureEight");
for (let i = 0; i < figure8CanvasElements.length; i++) {
    createFigure8Animation(figure8CanvasElements[i]);
}
