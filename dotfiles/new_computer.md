Some stuff to take note of when setting up a new computer

1. Touchpad right click not working

Download GNOME Tweaks and change the option. Otherwise, live with two finger taps for right click.

2. VIM clipboard not working

Default VIM doesn't have clipboard. Check with `vim --version | grep clip`. To fix, `sudo apt install vim-gtk3`.
