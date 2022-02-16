function getDot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function getMagnitude(a) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * a[i];
  }
  return Math.sqrt(sum);
}

function getCosineSimilarity(a, b) {
  return getDot(a, b) / (getMagnitude(a) * getMagnitude(b));
}

async function getWordVector(word) {
  const url = `https://glove-embeddings.github.io/glove.6B.300d/${word}`;
  const response = await fetch(url);
  try {
    return await response.json();
  } catch (e) {
    return null;
  }
}

async function main() {
  let target_word =
    target_words[Math.floor(Math.random() * target_words.length)];
  console.log(`target word: ${target_word}`);

  let target_vec = await getWordVector(target_word);
  console.log(target_vec);

  let guesses = [];

  var guess = document.getElementById("guess");
  guess.addEventListener("keyup", function (event) {
    if (event.keyCode === 13) {
      event.preventDefault();
      document.getElementById("submit_button").click();
    }
  });

  var submit_btn = document.getElementById("submit_button");
  submit_btn.addEventListener("click", async function () {
    var guess_word = document.getElementById("guess").value.toLowerCase();
    var guess_vec = await getWordVector(guess_word);
    if (guess_vec === null) {
      result = document.getElementById("result");
      result.innerHTML = `<strong>${guess_word}</strong> is not a valid word!`;
      result.style.color = "red";
    } else {
      similarity = getCosineSimilarity(target_vec, guess_vec).toFixed(3);
      result = document.getElementById("result");
      if (guess_word == target_word) {
        result.innerHTML = `<strong>${guess_word}</strong> is the correct word!`;
        result.style.color = "green";
      } else {
        result.innerHTML = `<strong>${guess_word}</strong> has a similarity of ${similarity}`;
        result.style.color = "blue";
      }
      if (
        typeof guesses.map((x) => x.guess).find((x) => x == guess_word) ===
        "undefined"
      ) {
        guesses.push({ guess: guess_word, similarity: similarity });
        guesses.sort((a, b) => b.similarity - a.similarity);
        var guesses_html_string = guesses
          .map(
            (a) =>
              `${a.guess == target_word ? "<strong>" : ""}${a.guess}: ${
                a.similarity
              }${a.guess == target_word ? "</strong>" : ""}`
          )
          .join("<br>");
        results = document.getElementById("results");
        results.innerHTML = guesses_html_string;
      }
    }
    document.getElementById("guess").value = "";
  });
}

main();
