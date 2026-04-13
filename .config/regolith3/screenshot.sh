#!/bin/bash
# Screenshot to clipboard

FILE=$(mktemp /tmp/screenshot-XXXXXX.png)
FLAGS=$1
gnome-screenshot $FLAGS --file=$FILE
xclip -selection clipboard -t image/png -i $FILE

rm $FILE
