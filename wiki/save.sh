cp -r images/ ~/Documents/github/bentrevett.github.io/wiki/
cp index.html ~/Documents/github/bentrevett.github.io/wiki/
cp save.sh ~/Documents/github/bentrevett.github.io/wiki/
git -C ~/Documents/github/bentrevett.github.io/ add wiki/*
git -C ~/Documents/github/bentrevett.github.io/ commit -m  "$0"
git -C ~/Documents/github/bentrevett.github.io/ push