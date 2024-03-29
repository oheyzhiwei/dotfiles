# If you come from bash you might have to change your $PATH.
# export PATH=$HOME/bin:/usr/local/bin:$PATH

# User configuration
HISTSIZE=500000
HISTFILESIZE=100000
HISTORY_IGNORE="(ls|pwd|exit|bg|fg|history|clear)"

export VISUAL=vim
export EDITOR="$VISUAL"
export LANG=en_US.UTF-8

# Path to your oh-my-zsh installation.
export ZSH=$HOME/.oh-my-zsh
# Set name of the theme to load. Optionally, if you set this to "random"
# it'll load a random theme each time that oh-my-zsh is loaded.
# See https://github.com/robbyrussell/oh-my-zsh/wiki/Themes
ZSH_THEME="powerlevel9k/powerlevel9k"
ZSH_CUSTOM="$HOME/.zsh/"


# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
DISABLE_UNTRACKED_FILES_DIRTY="true"
bgnotify_threshold=7
plugins=(git gitfast git-extras colored-man-pages command-not-found copypath cp dircycle fasd tmuxinator bgnotify docker kubectl)

source $ZSH/oh-my-zsh.sh

# Override certain config in zsh
bindkey '^H' backward-kill-word
unsetopt share_history
setopt APPEND_HISTORY RM_STAR_SILENT NO_HIST_VERIFY

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
bindkey '^F' fzf-file-widget
# Use ag to respect .agignore
export FZF_DEFAULT_COMMAND='ag --hidden -g ""'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"

# Elixir shell history
export ERL_AFLAGS="-kernel shell_history enabled"



eval "$(pyenv init -)"

# add Pulumi to the PATH
export PATH=$PATH:$HOME/.pulumi/bin

# Bazel completion
zstyle ':completion:*' use-cache on
zstyle ':completion:*' cache-path ~/.zsh/cache

# What could go wrong?
# eval "$(github-copilot-cli alias -- "$0")"

_fzf_complete_bazel() {
  _fzf_complete --prompt="bazel> " -- "$@" < <(
  bazel query --noshow_progress --keep_going '//... -//experimental/...'
  ) 
}
_fzf_complete_b() {
  _fzf_complete --prompt="bazel> " -- "$@" < <(
  bazel query --noshow_progress --keep_going '//... -//experimental/...'
  ) 
}

if [ -n "command -v temporal" ]; then source <(temporal completion zsh); fi
if [ -n "command -v direnv" ]; then eval "$(direnv hook zsh)"; fi

# -- added by 02_pyenv_setup_bash.sh --
which pyenv > /dev/null && eval "$(pyenv init -)"
which pyenv > /dev/null && eval "$(pyenv virtualenv-init - | grep -v 'export PATH' )"

# The next line updates PATH for the Google Cloud SDK.
if [ -f '/home/zhiwei/code/google-cloud-sdk/path.zsh.inc' ]; then . '/home/zhiwei/code/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/home/zhiwei/code/google-cloud-sdk/completion.zsh.inc' ]; then . '/home/zhiwei/code/google-cloud-sdk/completion.zsh.inc'; fi
# -- added by kubectl_setup_bash.sh --
export USE_GKE_GCLOUD_AUTH_PLUGIN=True
