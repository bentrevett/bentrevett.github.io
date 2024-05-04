function createCircleAnimation(canvas) {
    const ctx = canvas.getContext("2d");
    canvas.width = 40;
    canvas.height = 40;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const sunRadius = 3;
    const planetRadius = 3;
    const orbitRadiusX = 15;
    const orbitRadiusY = 15;
    let angle = 0;

    function drawOrbit() {
        ctx.beginPath();
        ctx.ellipse(
            centerX,
            centerY,
            orbitRadiusX,
            orbitRadiusY,
            Math.PI,
            0,
            Math.PI * 2
        );
        ctx.strokeStyle = "black";
        ctx.stroke();
    }

    function drawSun() {
        ctx.beginPath();
        ctx.arc(centerX, centerY, sunRadius, 0, Math.PI * 2);
        ctx.fillStyle = "black";
        ctx.fill();
    }

    function drawPlanet() {
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);
        const cosRotation = Math.cos(Math.PI);
        const sinRotation = Math.sin(Math.PI);
        const planetX =
            centerX +
            (cosAngle * orbitRadiusX * cosRotation -
                sinAngle * orbitRadiusY * sinRotation);
        const planetY =
            centerY +
            (cosAngle * orbitRadiusX * sinRotation +
                sinAngle * orbitRadiusY * cosRotation);
        ctx.beginPath();
        ctx.arc(planetX, planetY, planetRadius, 0, Math.PI * 2);
        ctx.fillStyle = "black";
        ctx.fill();
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawOrbit();
        drawSun();
        drawPlanet();

        angle += 0.03;
        requestAnimationFrame(animate);
    }

    animate();
}

const circleCanvasElements = document.getElementsByClassName("circle");
for (let i = 0; i < circleCanvasElements.length; i++) {
    createCircleAnimation(circleCanvasElements[i]);
}
