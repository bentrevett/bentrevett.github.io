rollDice = function() {
    var w1Dice = document.getElementById('w1');
    var w2Dice = document.getElementById('w2');
    var c1Dice = document.getElementById('c1');
    var c2Dice = document.getElementById('c2');
    var tDice = document.getElementById('t');
    
    var w1Roll = Math.floor(Math.random() * 6) + 1;
    var w2Roll = Math.floor(Math.random() * 6) + 1;
    var c1Roll = Math.floor(Math.random() * 6) + 1;
    var c2Roll = Math.floor(Math.random() * 6) + 1;
    var tRoll = Math.floor(Math.random() * 6) + 1;
    
    if (tRoll > 2) {
        tRoll = 1;
    } 
    else {
        tRoll = 2;
    }

    w1Dice.src = "w" + w1Roll.toString() + ".png";
    w2Dice.src = "w" + w2Roll.toString() + ".png";
    c1Dice.src = "c" + c1Roll.toString() + ".png";
    c2Dice.src = "c" + c2Roll.toString() + ".png";
    tDice.src = "t" + tRoll.toString() + ".png";
}

document.addEventListener('click', rollDice); 