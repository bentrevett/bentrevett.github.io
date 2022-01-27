import { v4 as uuidv4 } from "https://jspm.dev/uuid";

var input = document.getElementById("amount");
input.addEventListener("keyup", function (event) {
  if (event.keyCode === 13) {
    event.preventDefault();
    document.getElementById("generate_button").click();
  }
});

var gen_btn = document.getElementById("generate_button");
gen_btn.addEventListener("click", function () {
  var amount = document.getElementById("amount").value;
  if (amount > 0) {
    let uuids = [];
    for (var i = 0; i < amount; i++) {
      uuids.push(uuidv4());
    }
    var uuids_html_string = uuids.join("<br>");
    document.getElementById("uuid").innerHTML = uuids_html_string;
  }
});

var copy_btn = document.getElementById("copy_button");
copy_btn.addEventListener("click", function () {
  navigator.clipboard.writeText(
    document.getElementById("uuid").innerHTML.replace(/<br>/g, "\n")
  );
});

var download_btn = document.getElementById("download_button");
download_btn.addEventListener("click", function () {
  var blob = new Blob(
    [document.getElementById("uuid").innerHTML.replace(/<br>/g, "\n")],
    { type: "text/plain;charset=utf-8" }
  );
  var a = document.createElement("a");
  a.download = "uuids.txt";
  a.href = URL.createObjectURL(blob);
  a.click();
});

gen_btn.click();
