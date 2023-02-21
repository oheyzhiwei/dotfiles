export USE_GKE_GCLOUD_AUTH_PLUGIN=True
export PATH=~/bin:$PATH
export PATH="$HOME/go/bin:$PATH"
export PATH=$PATH:/usr/local/go/bin
export PATH="$HOME/.yarn/bin:$HOME/.config/yarn/global/node_modules/.bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"
# Android studio
export PATH="$HOME/Applications/android-studio/bin:$PATH"
# Maven
export PATH="$HOME/Applications/apache-maven-3.8.5/bin:$PATH"
# gCloud
export PATH="$HOME/Applications/google-cloud-sdk/bin:$PATH"
# Flutter
export FLUTTER_DIR="$HOME/.flutter"
export PATH="$FLUTTER_DIR/flutter/bin:$FLUTTER_DIR/bin:$FLUTTER_DIR/bin/cache/dart-sdk/bin:$HOME/.pub-cache/bin:$PATH"
export PROTOC_HOME="$HOME/.protoc"
export PATH="$PROTOC_HOME/bin:$PATH"

# Android
export ANDROID_HOME="$HOME/.android"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init --path)"

# export JAVA_HOME="$HOME/Applications/android-studio/jre"
export JAVA_HOME="/usr/lib/jvm/java-11-openjdk-amd64"
export GPG_TTY=$(tty)

# NVM
# Hard code default to lts/carbon bin folder for spacemacs / CLI tools.
# This means node and other CLI tools will use this version until nvm is initialized
export NVMBIN=$HOME/.nvm/versions/node/v16.17.0/bin
export PATH=$PATH:$NVMBIN
# Setup lazy loading for nvm
NVM_INITIALIZED=false
function initialize_nvm(){
	if [ "$NVM_INITIALIZED" = false ];
	then
		# echo 'Initializing nvm'
		unset -f nvm
		export NVM_DIR="$HOME/.nvm"
		[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
		NVM_INITIALIZED=true
	fi
}
#
# Temporarily disable lazy init because pyright gets stuck
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
function nvm(){
	initialize_nvm
	nvm $@
}

function node(){
	unset -f node
	initialize_nvm
	node $@
}

function npm(){
	unset -f npm
	initialize_nvm
	npm $@
}

function yarn(){
	unset -f yarn
	initialize_nvm
	yarn $@
}

# pyenv
# PYENV_INITIALIZED=false
# function initialize_pyenv() {
# 	if [ "$PYENV_INITIALIZED" = false ] ;
# 	then
# 		eval "$(pyenv init -)"
# 		eval "$(pyenv virtualenv-init -)"
# 		PYENV_INITIALIZED=true
# 	fi
# }
# Couldn't get this to work with spacemacs
# if  [ -n "$(command -v pyenv)"  ];
# then
# 	initialize_pyenv
# fi
# function pyenv() {
# 	unset -f pyenv
# 	initialize_pyenv
# 	pyenv $@
# }

# function python() {
# 	unset -f python
# 	initialize_pyenv
# 	python $@
# }
# function pip() {
# 	unset -f pip
# 	initialize_pyenv
# 	pip $@
# }

. "$HOME/.cargo/env"
