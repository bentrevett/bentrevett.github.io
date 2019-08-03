selectAction = function() {
    var addAction = document.getElementById("add");
    var takeAction = document.getElementById("take");
    
    var addWhich = Math.floor(Math.random() * 4) + 1;
    var takeWhich = Math.floor(Math.random() * 3) + 1;

    addAction.textContent = "Add to: "
    takeAction.textContent = "Take from: "

    switch (addWhich){
        case 1:
            addAction.textContent += "none";
            break;
        case 2:
            addAction.textContent += "left";
            break;
        case 3:
            addAction.textContent += "middle";
            break;
        case 4:
            addAction.textContent += "right";
            break;
    }

    switch (takeWhich){
        case 1:
            takeAction.textContent += "left";
            break;
        case 2:
            takeAction.textContent += "middle";
            break;
        case 3:
            takeAction.textContent += "right";
            break;
    }
}

//need this to work on iphones
let touchEvent = 'ontouchstart' in window ? 'touchstart' : 'click';

document.addEventListener(touchEvent, selectAction);

//rolls dice on page load
window.onload = selectAction;