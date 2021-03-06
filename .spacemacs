;; -*- mode: emacs-lisp -*-
;; This file is loaded by Spacemacs at startup.
;; It must be stored in your home directory.

(defun dotspacemacs/layers ()
  "Configuration Layers declaration.
You should not put any user code in this function besides modifying the variable
values."
  (setq-default
    ;; Base distribution to use. This is a layer contained in the directory
    ;; `+distribution'. For now available distributions are `spacemacs-base'
    ;; or `spacemacs'. (default 'spacemacs)
    dotspacemacs-distribution 'spacemacs
    ;; Lazy installation of layers (i.e. layers are installed only when a file
    ;; with a supported type is opened). Possible values are `all', `unused'
    ;; and `nil'. `unused' will lazy install only unused layers (i.e. layers
    ;; not listed in variable `dotspacemacs-configuration-layers'), `all' will
    ;; lazy install any layer that support lazy installation even the layers
    ;; listed in `dotspacemacs-configuration-layers'. `nil' disable the lazy
    ;; installation feature and you have to explicitly list a layer in the
    ;; variable `dotspacemacs-configuration-layers' to install it.
    ;; (default 'unused)
    dotspacemacs-enable-lazy-installation 'unused
    ;; If non-nil then Spacemacs will ask for confirmation before installing
    ;; a layer lazily. (default t)
    dotspacemacs-ask-for-lazy-installation t
    ;; If non-nil layers with lazy install support are lazy installed.
    ;; List of additional paths where to look for configuration layers.
    ;; Paths must have a trailing slash (i.e. `~/.mycontribs/')
    dotspacemacs-configuration-layer-path '()
    ;; List of configuration layers to load.
    dotspacemacs-configuration-layers
    '(ansible
       protobuf
       auto-completion
       c-c++
       colors
       (dart :variables
         lsp-enable-on-type-formatting t
         lsp-dart-sdk-dir '"~/snap/flutter/common/flutter/bin/cache/dart-sdk")
       elixir
       emacs-lisp
       git
       (go :variables
         go-tab-width 4
         go-backend 'lsp)
       helm
       html
       javascript
       markdown
       neotree
       nginx
       org
       (python
         :variables python-formatter 'yapf
         python-backend 'lsp
         python-lsp-server 'pyright)
       react
       (shell :variables
         shell-default-height 30
         shell-default-position 'bottom)
       shell-scripts
       spell-checking
       sql
       syntax-checking
       typescript
       version-control
       yaml
       )
    ;; List of additional packages that will be installed without being
    ;; wrapped in a layer. If you need some configuration for these
    ;; packages, then consider creating a layer. You can also put the
    ;; configuration in `dotspacemacs/user-config'.
    dotspacemacs-additional-packages '(
                                        helm-ext
                                        ac-etags
                                        dockerfile-mode
                                        prettier-js
                                        groovy-mode
                                        bazel
                                        )
    ;; A list of packages that cannot be updated.
    dotspacemacs-frozen-packages '(fill-column-indicator)
    ;; dotspacemacs-frozen-packages '()
    ;; A list of packages that will not be installed and loaded.
    dotspacemacs-excluded-packages '(
                                      org-projectile
                                      )
    ;; Defines the behaviour of Spacemacs when installing packages.
    ;; Possible values are `used-only', `used-but-keep-unused' and `all'.
    ;; `used-only' installs only explicitly used packages and uninstall any
    ;; unused packages as well as their unused dependencies.
    ;; `used-but-keep-unused' installs only the used packages but won't uninstall
    ;; them if they become unused. `all' installs *all* packages supported by
    ;; Spacemacs and never uninstall them. (default is `used-only')
    dotspacemacs-install-packages 'used-only)
  )

(defun dotspacemacs/init ()
  "Initialization function.
This function is called at the very startup of Spacemacs initialization
before layers configuration.
You should not put any user code in there besides modifying the variable
values."
  ;; This setq-default sexp is an exhaustive list of all the supported
  ;; spacemacs settings.
  (setq-default
    ;; If non nil ELPA repositories are contacted via HTTPS whenever it's
    ;; possible. Set it to nil if you have no way to use HTTPS in your
    ;; environment, otherwise it is strongly recommended to let it set to t.
    ;; This variable has no effect if Emacs is launched with the parameter
    ;; `--insecure' which forces the value of this variable to nil.
    ;; (default t)
    dotspacemacs-elpa-https nil
    ;; Maximum allowed time in seconds to contact an ELPA repository.
    dotspacemacs-elpa-timeout 5
    ;; If non nil then spacemacs will check for updates at startup
    ;; when the current branch is not `develop'. Note that checking for
    ;; new versions works via git commands, thus it calls GitHub services
    ;; whenever you start Emacs. (default nil)
    dotspacemacs-check-for-update nil
    ;; If non-nil, a form that evaluates to a package directory. For example, to
    ;; use different package directories for different Emacs versions, set this
    ;; to `emacs-version'.
    dotspacemacs-elpa-subdirectory nil
    ;; One of `vim', `emacs' or `hybrid'.
    ;; `hybrid' is like `vim' except that `insert state' is replaced by the
    ;; `hybrid state' with `emacs' key bindings. The value can also be a list
    ;; with `:variables' keyword (similar to layers). Check the editing styles
    ;; section of the documentation for details on available variables.
    ;; (default 'vim)
    dotspacemacs-editing-style 'vim
    ;; If non nil output loading progress in `*Messages*' buffer. (default nil)
    dotspacemacs-verbose-loading nil
    ;; Specify the startup banner. Default value is `official', it displays
    ;; the official spacemacs logo. An integer value is the index of text
    ;; banner, `random' chooses a random text banner in `core/banners'
    ;; directory. A string value must be a path to an image format supported
    ;; by your Emacs build.
    ;; If the value is nil then no banner is displayed. (default 'official)
    dotspacemacs-startup-banner 'official
    ;; List of items to show in startup buffer or an association list of
    ;; the form `(list-type . list-size)`. If nil then it is disabled.
    ;; Possible values for list-type are:
    ;; `recents' `bookmarks' `projects' `agenda' `todos'."
    ;; List sizes may be nil, in which case
    ;; `spacemacs-buffer-startup-lists-length' takes effect.
    dotspacemacs-startup-lists '((recents . 5)
                                  (projects . 7))
    ;; True if the home buffer should respond to resize events.
    dotspacemacs-startup-buffer-responsive t
    ;; Default major mode of the scratch buffer (default `text-mode')
    dotspacemacs-scratch-mode 'text-mode
    ;; List of themes, the first of the list is loaded when spacemacs starts.
    ;; Press <SPC> T n to cycle to the next theme in the list (works great
    ;; with 2 themes variants, one dark and one light)
    dotspacemacs-themes '(spacemacs-dark
                           spacemacs-light)
    ;; If non nil the cursor color matches the state color in GUI Emacs.
    dotspacemacs-colorize-cursor-according-to-state t
    ;; Default font, or prioritized list of fonts. `powerline-scale' allows to
    ;; quickly tweak the mode-line size to make separators look not too crappy.
    dotspacemacs-default-font '("Source Code Pro"
                                 :size 13
                                 :weight normal
                                 :width normal
                                 :powerline-scale 1.1)
    ;; The leader key
    dotspacemacs-leader-key "SPC"
    ;; The key used for Emacs commands (M-x) (after pressing on the leader key).
    ;; (default "SPC")
    dotspacemacs-emacs-command-key "SPC"
    ;; The key used for Vim Ex commands (default ":")
    dotspacemacs-ex-command-key ":"
    ;; The leader key accessible in `emacs state' and `insert state'
    ;; (default "M-m")
    dotspacemacs-emacs-leader-key "M-m"
    ;; Major mode leader key is a shortcut key which is the equivalent of
    ;; pressing `<leader> m`. Set it to `nil` to disable it. (default ",")
    dotspacemacs-major-mode-leader-key ","
    ;; Major mode leader key accessible in `emacs state' and `insert state'.
    ;; (default "C-M-m")
    dotspacemacs-major-mode-emacs-leader-key "C-M-m"
    ;; These variables control whether separate commands are bound in the GUI to
    ;; the key pairs C-i, TAB and C-m, RET.
    ;; Setting it to a non-nil value, allows for separate commands under <C-i>
    ;; and TAB or <C-m> and RET.
    ;; In the terminal, these pairs are generally indistinguishable, so this only
    ;; works in the GUI. (default nil)
    dotspacemacs-distinguish-gui-tab nil
    ;; If non nil `Y' is remapped to `y$' in Evil states. (default nil)
    dotspacemacs-remap-Y-to-y$ nil
    ;; If non-nil, the shift mappings `<' and `>' retain visual state if used
    ;; there. (default t)
    dotspacemacs-retain-visual-state-on-shift t
    ;; If non-nil, J and K move lines up and down when in visual mode.
    ;; (default nil)
    dotspacemacs-visual-line-move-text t
    ;; If non nil, inverse the meaning of `g' in `:substitute' Evil ex-command.
    ;; (default nil)
    dotspacemacs-ex-substitute-global nil
    ;; Name of the default layout (default "Default")
    dotspacemacs-default-layout-name "Default"
    ;; If non nil the default layout name is displayed in the mode-line.
    ;; (default nil)
    dotspacemacs-display-default-layout nil
    ;; If non nil then the last auto saved layouts are resume automatically upon
    ;; start. (default nil)
    dotspacemacs-auto-resume-layouts nil
    ;; Size (in MB) above which spacemacs will prompt to open the large file
    ;; literally to avoid performance issues. Opening a file literally means that
    ;; no major mode or minor modes are active. (default is 1)
    dotspacemacs-large-file-size 1
    ;; Location where to auto-save files. Possible values are `original' to
    ;; auto-save the file in-place, `cache' to auto-save the file to another
    ;; file stored in the cache directory and `nil' to disable auto-saving.
    ;; (default 'cache)
    dotspacemacs-auto-save-file-location 'cache
    ;; Maximum number of rollback slots to keep in the cache. (default 5)
    dotspacemacs-max-rollback-slots 5
    ;; If non nil, `helm' will try to minimize the space it uses. (default nil)
    dotspacemacs-helm-resize nil
    ;; if non nil, the helm header is hidden when there is only one source.
    ;; (default nil)
    dotspacemacs-helm-no-header nil
    ;; define the position to display `helm', options are `bottom', `top',
    ;; `left', or `right'. (default 'bottom)
    dotspacemacs-helm-position 'bottom
    ;; Controls fuzzy matching in helm. If set to `always', force fuzzy matching
    ;; in all non-asynchronous sources. If set to `source', preserve individual
    ;; source settings. Else, disable fuzzy matching in all sources.
    ;; (default 'always)
    dotspacemacs-helm-use-fuzzy 'always
    ;; If non nil the paste micro-state is enabled. When enabled pressing `p`
    ;; several times cycle between the kill ring content. (default nil)
    dotspacemacs-enable-paste-transient-state t
    ;; Which-key delay in seconds. The which-key buffer is the popup listing
    ;; the commands bound to the current keystroke sequence. (default 0.4)
    dotspacemacs-which-key-delay 0.4
    ;; Which-key frame position. Possible values are `right', `bottom' and
    ;; `right-then-bottom'. right-then-bottom tries to display the frame to the
    ;; right; if there is insufficient space it displays it at the bottom.
    ;; (default 'bottom)
    dotspacemacs-which-key-position 'bottom
    ;; If non nil a progress bar is displayed when spacemacs is loading. This
    ;; may increase the boot time on some systems and emacs builds, set it to
    ;; nil to boost the loading time. (default t)
    dotspacemacs-loading-progress-bar t
    ;; If non nil the frame is fullscreen when Emacs starts up. (default nil)
    ;; (Emacs 24.4+ only)
    dotspacemacs-fullscreen-at-startup nil
    ;; If non nil `spacemacs/toggle-fullscreen' will not use native fullscreen.
    ;; Use to disable fullscreen animations in OSX. (default nil)
    dotspacemacs-fullscreen-use-non-native nil
    ;; If non nil the frame is maximized when Emacs starts up.
    ;; Takes effect only if `dotspacemacs-fullscreen-at-startup' is nil.
    ;; (default nil) (Emacs 24.4+ only)
    dotspacemacs-maximized-at-startup t
    ;; A value from the range (0..100), in increasing opacity, which describes
    ;; the transparency level of a frame when it's active or selected.
    ;; Transparency can be toggled through `toggle-transparency'. (default 90)
    dotspacemacs-active-transparency 90
    ;; A value from the range (0..100), in increasing opacity, which describes
    ;; the transparency level of a frame when it's inactive or deselected.
    ;; Transparency can be toggled through `toggle-transparency'. (default 90)
    dotspacemacs-inactive-transparency 90
    ;; If non nil show the titles of transient states. (default t)
    dotspacemacs-show-transient-state-title t
    ;; If non nil show the color guide hint for transient state keys. (default t)
    dotspacemacs-show-transient-state-color-guide t
    ;; If non nil unicode symbols are displayed in the mode line. (default t)
    dotspacemacs-mode-line-unicode-symbols t
    ;; If non nil smooth scrolling (native-scrolling) is enabled. Smooth
    ;; scrolling overrides the default behavior of Emacs which recenters point
    ;; when it reaches the top or bottom of the screen. (default t)
    dotspacemacs-smooth-scrolling t
    ;; Control line numbers activation.
    ;; If set to `t' or `relative' line numbers are turned on in all `prog-mode' and
    ;; `text-mode' derivatives. If set to `relative', line numbers are relative.
    ;; This variable can also be set to a property list for finer control:
    ;; '(:relative nil
    ;;   :disabled-for-modes dired-mode
    ;;                       doc-view-mode
    ;;                       markdown-mode
    ;;                       org-mode
    ;;                       pdf-view-mode
    ;;                       text-mode
    ;;   :size-limit-kb 1000)
    ;; (default nil)
    dotspacemacs-line-numbers 'relative
    ;; Code folding method. Possible values are `evil' and `origami'.
    ;; (default 'evil)
    dotspacemacs-folding-method 'evil
    ;; If non-nil smartparens-strict-mode will be enabled in programming modes.
    ;; (default nil)
    dotspacemacs-smartparens-strict-mode nil
    ;; If non-nil pressing the closing parenthesis `)' key in insert mode passes
    ;; over any automatically added closing parenthesis, bracket, quote, etc…
    ;; This can be temporary disabled by pressing `C-q' before `)'. (default nil)
    dotspacemacs-smart-closing-parenthesis nil
    ;; Select a scope to highlight delimiters. Possible values are `any',
    ;; `current', `all' or `nil'. Default is `all' (highlight any scope and
    ;; emphasis the current one). (default 'all)
    dotspacemacs-highlight-delimiters 'all
    ;; If non nil, advise quit functions to keep server open when quitting.
    ;; (default nil)
    dotspacemacs-persistent-server nil
    ;; List of search tool executable names. Spacemacs uses the first installed
    ;; tool of the list. Supported tools are `ag', `pt', `ack' and `grep'.
    ;; (default '("ag" "pt" "ack" "grep"))
    dotspacemacs-search-tools '("ag" "pt" "ack" "grep")
    ;; The default package repository used if no explicit repository has been
    ;; specified with an installed package.
    ;; Not used for now. (default nil)
    dotspacemacs-default-package-repository nil
    ;; Delete whitespace while saving buffer. Possible values are `all'
    ;; to aggressively delete empty line and long sequences of whitespace,
    ;; `trailing' to delete only the whitespace at end of lines, `changed'to
    ;; delete only whitespace for changed lines or `nil' to disable cleanup.
    ;; (default nil)
    dotspacemacs-whitespace-cleanup nil
    ))

(defun dotspacemacs/user-init ()
  "Initialization function for user code.
It is called immediately after `dotspacemacs/init', before layer configuration
executes.
 This function is mostly useful for variables that need to be set
before packages are loaded. If you are unsure, you should try in setting them in
`dotspacemacs/user-config' first."
  (setq-default evil-escape-unordered-key-sequence t)
  (setq neo-vc-integration 'face)
  (setq exec-path-from-shell-variables '(
                                          "PATH"
                                          ;; "GOPATH"
                                          ;; "GOROOT"
                                          ;; "GOBIN"
                                          "NVMBIN"
                                          ))
  )

(defun dotspacemacs/user-config ()
  "Configuration function for user code.
This function is called at the very end of Spacemacs initialization after
layers configuration.
This is the place where most of your configurations should be done. Unless it is
explicitly specified that a variable should be set before a package is loaded,
you should place your code here."
  (add-to-list 'auto-mode-alist '("Jenkisfile" . groovy-mode))
  (add-to-list 'auto-mode-alist '("\\.env" . dotenv-mode))

  ;; (add-hook 'protobuf-mode-hook
  ;;   (lambda ()
  ;;     (setq indent-tabs-mode 1)
  ;;     ()
  ;;     (setq tab-width 4)))
  (defconst my-protobuf-style
    '((c-basic-offset . 4)
       (indent-tabs-mode . nil)))
  (add-hook 'protobuf-mode-hook
    (lambda () (c-add-style "my-protobuf-style" my-protobuf-style t)))

  (golden-ratio-mode t)
  ;; Make golden ratio work well with ediff mode?
  (defun pl/ediff-comparison-buffer-p ()
    (and (boundp 'ediff-this-buffer-ediff-sessions)
      ediff-this-buffer-ediff-sessions))

  (with-eval-after-load "golden-ratio"
    '(progn
       (add-to-list 'golden-ratio-exclude-modes "ediff-mode")
       (add-to-list 'golden-ratio-inhibit-functions 'pl/ediff-comparison-buffer-p)))

  ;;sql-indent mode
  (eval-after-load "sql"
    '(load-library "sql-indent"))
  ;; Ediff settings
  (defun my-ediff-startup-hook ()
    "Workaround to balance the ediff windows when golden-ratio is enabled."
    ;; There's probably a better way to do it.
    (ediff-toggle-split)
    (ediff-toggle-split))
  (add-hook 'ediff-startup-hook 'my-ediff-startup-hook)
  ;; Press c to copy both regions in ediff
  (defun ediff-copy-both-to-C ()
    (interactive)
    (ediff-copy-diff ediff-current-difference nil 'C nil
      (concat
        (ediff-get-region-contents ediff-current-difference 'A ediff-control-buffer)
        (ediff-get-region-contents ediff-current-difference 'B ediff-control-buffer))))
  (defun add-c-to-ediff-mode-map () (define-key ediff-mode-map "c" 'ediff-copy-both-to-C))
  (add-hook 'ediff-keymap-setup-hook 'add-c-to-ediff-mode-map)


  ;; noremap B and E
  (define-key evil-normal-state-map "E" 'evil-end-of-line)
  (define-key evil-normal-state-map "B" 'evil-beginning-of-line)

  (define-key evil-visual-state-map "E" 'evil-end-of-line)
  (define-key evil-visual-state-map "B" 'evil-beginning-of-line)

  (define-key evil-motion-state-map "E" 'evil-end-of-line)
  (define-key evil-motion-state-map "B" 'evil-beginning-of-line)
  ;; Remap j k for better navigation in wrapped lines
  ;; Also in visual mode
  (define-key evil-visual-state-map "j" 'evil-next-visual-line)
  (define-key evil-visual-state-map "k" 'evil-previous-visual-line)

  (evil-define-motion my-evil-next-line (count)
    :type line
    (let ((command (if count 'evil-next-line 'evil-next-visual-line)))
      (funcall command (prefix-numeric-value count))))

  (define-key evil-motion-state-map (kbd "j") 'my-evil-next-line)

  (evil-define-motion my-evil-previous-line (count)
    :type line
    (let ((command (if count 'evil-previous-line 'evil-previous-visual-line)))
      (funcall command (prefix-numeric-value count))))

  (define-key evil-motion-state-map (kbd "k") 'my-evil-previous-line)
  (define-key evil-normal-state-map (kbd "C-;") 'evil-repeat-find-char-reverse)

  ;; Make ctrl backspace work like normal people
  (defun aborn/backward-kill-word ()
    "Customize/Smart backward-kill-word."
    (interactive)
    (let* ((cp (point))
            (backword)
            (end)
            (space-pos)
            (backword-char (if (bobp)
                             ""           ;; cursor in begin of buffer
                             (buffer-substring cp (- cp 1)))))
      (if (equal (length backword-char) (string-width backword-char))
        (progn
          (save-excursion
            (setq backword (buffer-substring (point) (progn (forward-word -1) (point)))))
          (setq ab/debug backword)
          (save-excursion
            (when (and backword          ;; when backword contains space
                    (s-contains? " " backword))
              (setq space-pos (ignore-errors (search-backward " ")))))
          (save-excursion
            (let* ((pos (ignore-errors (search-backward-regexp "\n")))
                    (substr (when pos (buffer-substring pos cp))))
              (when (or (and substr (s-blank? (s-trim substr)))
                      (s-contains? "\n" backword))
                (setq end pos))))
          (if end
            (kill-region cp end)
            (if space-pos
              (kill-region cp space-pos)
              (backward-kill-word 1))))
        (kill-region cp (- cp 1)))         ;; word is non-english word
      ))

  (global-set-key  [C-backspace]
    'aborn/backward-kill-word)
  ;; Prettier
  ;; prettier hook
  (require 'prettier-js)
  (setq prettier-target-mode "js2-mode")
  (setq prettier-js-args '(
                            "--trailing-comma" "es5"
                            "--bracket-spacing" "true"
                            "--single-quote" "true"
                            ))
  (remove-hook 'before-save-hook 'prettier-before-save t)
  ;; (add-hook 'js2-mode-hook
  ;;   #'(lambda ()
  ;;       (add-hook 'before-save-hook 'prettier-before-save nil t)))
  ;; Shamelessly stolen from glen
  (setq-default
    lisp-indent-offset 2
    ;; json-mode
    json-encoding-default-indentation 2
    ;; js2-mode
    js-indent-level 2
    js-curly-indent-offset 0
    js2-basic-offset 2
    js-switch-indent-offset 2
    ;; typescript mode
    typescript-expr-indent-offset 2
    typescript-indent-level 2
    ;; web-mode
    css-indent-offset 2
    web-mode-markup-indent-offset 2
    web-mode-css-indent-offset 2
    web-mode-code-indent-offset 2
    web-mode-attr-indent-offset 2
    ;; groovy-mode
    groovy-indent-offset 2
    )
  (with-eval-after-load 'web-mode
    (add-to-list 'web-mode-indentation-params '("lineup-args" . nil))
    (add-to-list 'web-mode-indentation-params '("lineup-concats" . nil))
    (add-to-list 'web-mode-indentation-params '("lineup-calls" . nil)))
  ;; js editing configurations
  ;; -----------------
  ;; use local eslint
  (defun my/use-eslint-from-node-modules ()
    (let* ((root (locate-dominating-file
                   (or (buffer-file-name) default-directory)
                   "node_modules"))
            (eslint (and root
                      (expand-file-name "node_modules/eslint/bin/eslint.js"
                        root))))
      (when (and eslint (file-executable-p eslint))
        (setq-local flycheck-javascript-eslint-executable eslint))))
  ;; Customize spaceline
  ;; -------------------
  (spaceline-toggle-buffer-size-off)
  (defun doom-ml-project-root (&optional strict-p)
    "Get the path to the root of your project."
    (let (projectile-require-project-root strict-p)
      (projectile-project-root)))
  (defun buffer-path ()
    "Displays the buffer's full path relative to the project root (includes the
project root). Excludes the file basename. See `*buffer-name' for that."
    (when buffer-file-name
      (propertize
        (f-dirname
          (let ((buffer-path (file-relative-name buffer-file-name (doom-ml-project-root)))
                 (max-length (truncate (/ (window-body-width) 1.75))))
            (concat (projectile-project-name) "/"
              (if (> (length buffer-path) max-length)
                (let ((path (reverse (split-string buffer-path "/" t)))
                       (output ""))
                  (when (and path (equal "" (car path)))
                    (setq path (cdr path)))
                  (while (and path (<= (length output) (- max-length 4)))
                    (setq output (concat (car path) "/" output))
                    (setq path (cdr path)))
                  (when path
                    (setq output (concat "../" output)))
                  (when (string-suffix-p "/" output)
                    (setq output (substring output 0 -1)))
                  output)
                buffer-path))))
        'face (if active 'mode-line-2))))

  (spaceline-define-segment pwd-segment
    (buffer-path)
    )
  ;; TODO find out how to put this on the left side without redefining the whole theme
  (spaceline-spacemacs-theme 'pwd-segment)

  ;; Configure Helm
  ;; -----------------------
  ;; Use helm-ext which enables split actions and other stuff

  (with-eval-after-load 'helm
    (helm-ext-ff-enable-split-actions t)
    (helm-ext-ff-enable-skipping-dots t)
    )
  (with-eval-after-load 'helm-ag
    (add-to-list 'helm-ag--actions
      helm-ext-ff--horizontal-split-action t)
    (add-to-list 'helm-ag--actions
      helm-ext-ff--vertical-split-action t)
    (define-key helm-ag-map
      (kbd helm-ext-ff-horizontal-split-key) #'helm-ext-ff-execute-horizontal-split)
    (define-key helm-ag-map
      (kbd helm-ext-ff-vertical-split-key) #'helm-ext-ff-execute-vertical-split))

  ;; c++
  (setq-default dotspacemacs-configuration-layers
    '((c-c++ :variables c-c++-enable-clang-support t)))

  ;; elixir
  (add-hook 'elixir-mode-hook
    (lambda () (add-hook 'before-save-hook 'elixir-format nil t)))

  ;; org-mode

  ;; org-mode capture templates
  (setq org-capture-templates
    '(("t" "(T)odo" entry (file+headline "~/org/gtd.org" "Tasks")
        "** TODO %?\n  %U" :empty-lines 1)
       ("c" "(C)ontextual Todo" entry (file+headline "~/org/gtd.org" "Tasks")
         "** TODO %?\n  %a\n  %U" :empty-lines 1)
       ("j" "(J)ournal" entry (file+datetree "~/org/journal.org")
         "** %?\n" :prepend t)))
  (setq org-todo-keywords
    '((sequence "TODO" "NEXT" "BLOCKED" "DONE")))

  ;; Archives all done tasks in a file, can also use 'tree or 'agenda
  (defun org-archive-done-tasks-file ()
    (interactive)
    (org-map-entries
      (lambda ()
        (org-archive-subtree)
        (setq org-map-continue-from (outline-previous-heading)))
      "/DONE" 'file))
  (spacemacs/declare-prefix-for-mode 'org-mode "oa" "archive" "archive")
  (spacemacs/set-leader-keys-for-major-mode 'org-mode "oaf" 'org-archive-done-tasks-file)

  (with-eval-after-load 'org-mode
    ;; line-wrap in org-mode
    (toggle-truncate-lines)
    )


  ;; dart
  (defun custom/dartfmt()
    (interactive)
    (shell-command (concatenate 'string "flutter format " (buffer-file-name)))
    )
  (add-hook 'dart-mode-hook
    (lambda ()
      (setq indent-tabs-mode nil)
      (setq tab-width 2)))

  ;; python
  ;; (with-eval-after-load 'python
  ;;   )
  ;; Arbo
  (with-eval-after-load 'lsp-mode
    (add-to-list 'lsp-file-watch-ignored-directories "[/\\\\]bazel-")
    (add-to-list 'lsp-file-watch-ignored-directories "[/\\\\]bazel-[^/\\\\]+\\'")
    (add-to-list 'lsp-file-watch-ignored-directories "[/\\\\]gen[^/\\\\]+\\'")
    (add-to-list 'lsp-file-watch-ignored-directories "/home/zhiwei/code/arbo/dataworks/client.+")
    (add-to-list 'lsp-file-watch-ignored-directories "/home/zhiwei/code/arbo/dataworks/experimental.+")
    (add-to-list 'lsp-file-watch-ignored-directories "/home/zhiwei/code/arbo/dataworks/cloud/deploy.+")
    (add-to-list 'lsp-file-watch-ignored-directories "/home/zhiwei/code/arbo/dataworks/cloud/database.+")
    (add-to-list 'lsp-file-watch-ignored-directories "/home/zhiwei/code/arbo/dataworks/cloud/setup.+")
    )

  ;; Golden ratio
  (define-advice select-window (:after (window &optional no-record) golden-ratio-resize-window)
    (golden-ratio)
    nil)

  ;; golang
  ;; (lsp-register-custom-settings '(("gopls.")))

  ;; end dotspacemacs/user-config
  )

;; Do not write anything past this comment. This is where Emacs will
;; auto-generate custom variable definitions.
(custom-set-variables
  ;; custom-set-variables was added by Custom.
  ;; If you edit it by hand, you could mess it up, so be careful.
  ;; Your init file should contain only one such instance.
  ;; If there is more than one, they won't work right.
  '(ansi-color-faces-vector
     [default default default italic underline success warning error])
  '(evil-cross-lines t)
  '(evil-escape-key-sequence "fd")
  '(evil-want-Y-yank-to-eol nil)
  '(golden-ratio-exclude-buffer-names (quote (" *which-key*" "*LV*" " *NeoTree*" "*Ediff*")))
  '(golden-ratio-exclude-modes
     (quote
       ("speedbar-mode" "gdb-memory-mode" "gdb-disassembly-mode" "gdb-inferior-io-mode" "gdb-frames-mode" "gdb-threads-mode" "gdb-breakpoints-mode" "gdb-registers-mode" "gdb-locals-mode" "gud-mode" "dired-mode" "ediff-mode" "calc-mode" "bs-mode")))
  '(golden-ratio-mode t)
  '(helm-projectile-grep-or-ack-actionsprojectile-grep-or-ack-actions
     (quote
       ("Find file" helm-grep-action "Find file other frame" helm-grep-other-frame
         (lambda nil
           (and
             (locate-library "elscreen")
             "Find file in Elscreen"))
         helm-grep-jump-elscreen "Save results in grep buffer" helm-grep-save-results "Find file other window" helm-grep-other-window "something" helm-grep-other-window)))
  '(js-indent-level 2 t)
  '(js2-basic-offset 2 t)
  '(js2-strict-trailing-comma-warning nil)
  '(line-number-mode nil)
  '(org-agenda-files (quote ("~/org/gtd.org")))
  '(package-selected-packages
     (quote
       (org-projectile org-category-capture org-present org-pomodoro alert log4e gntp org-mime org-download htmlize gnuplot typescript-mode powerline hydra lv projectile groovy-mode flyspell-correct company-ansible anaconda-mode avy tern anzu iedit smartparens evil goto-chg elixir-mode flycheck company request helm helm-core yasnippet multiple-cursors magit-popup magit transient git-commit with-editor async markdown-mode org-plus-contrib pythonic f haml-mode js2-mode simple-httpd dash jedi jedi-core python-environment epc ctable concurrent deferred terraform-mode hcl-mode rvm ruby-tools ruby-test-mode rubocop rspec-mode robe rbenv rake omnisharp shut-up minitest csharp-mode chruby bundler inf-ruby yapfify yaml-mode xterm-color ws-butler winum which-key web-mode web-beautify volatile-highlights vi-tilde-fringe uuidgen use-package toc-org tide tagedit sql-indent spaceline smeargle slim-mode shell-pop scss-mode sass-mode restart-emacs rainbow-mode rainbow-identifiers rainbow-delimiters pyvenv pytest pyenv-mode py-isort pug-mode prettier-js popwin pip-requirements persp-mode pcre2el paradox orgit org-bullets open-junk-file ob-elixir nginx-mode neotree multi-term move-text mmm-mode markdown-toc magit-gitflow macrostep lorem-ipsum livid-mode live-py-mode linum-relative link-hint less-css-mode json-mode js2-refactor js-doc insert-shebang info+ indent-guide hy-mode hungry-delete hl-todo highlight-parentheses highlight-numbers highlight-indentation hide-comnt help-fns+ helm-themes helm-swoop helm-pydoc helm-projectile helm-mode-manager helm-make helm-gitignore helm-flx helm-ext helm-descbinds helm-css-scss helm-company helm-c-yasnippet helm-ag google-translate golden-ratio go-guru go-eldoc gitconfig-mode gitattributes-mode git-timemachine git-messenger git-link git-gutter-fringe git-gutter-fringe+ gh-md fuzzy flyspell-correct-helm flycheck-pos-tip flycheck-mix flycheck-credo flx-ido fish-mode fill-column-indicator fancy-battery eyebrowse expand-region exec-path-from-shell evil-visualstar evil-visual-mark-mode evil-unimpaired evil-tutor evil-surround evil-search-highlight-persist evil-numbers evil-nerd-commenter evil-mc evil-matchit evil-magit evil-lisp-state evil-indent-plus evil-iedit-state evil-exchange evil-escape evil-ediff evil-args evil-anzu eval-sexp-fu eshell-z eshell-prompt-extras esh-help emmet-mode elisp-slime-nav dumb-jump dockerfile-mode disaster diff-hl define-word cython-mode company-web company-tern company-statistics company-shell company-go company-c-headers company-anaconda column-enforce-mode color-identifiers-mode coffee-mode cmake-mode clean-aindent-mode clang-format auto-yasnippet auto-highlight-symbol auto-dictionary auto-compile alchemist aggressive-indent adaptive-wrap ace-window ace-link ace-jump-helm-line ac-ispell ac-etags)))
  '(paradox-github-token t)
  '(projectile-globally-ignored-directories
     (quote
       (".idea" ".ensime_cache" ".eunit" ".git" ".hg" ".fslckout" "_FOSSIL_" ".bzr" "_darcs" ".tox" ".svn" ".stack-work" "venv" "virtualenv" "node_modules"))))
(custom-set-faces
  ;; custom-set-faces was added by Custom.
  ;; If you edit it by hand, you could mess it up, so be careful.
  ;; Your init file should contain only one such instance.
  ;; If there is more than one, they won't work right.
  )
(defun dotspacemacs/emacs-custom-settings ()
  "Emacs custom settings.
This is an auto-generated function, do not modify its content directly, use
Emacs customize menu instead.
This function is called at the very end of Spacemacs initialization."
(custom-set-variables
 ;; custom-set-variables was added by Custom.
 ;; If you edit it by hand, you could mess it up, so be careful.
 ;; Your init file should contain only one such instance.
 ;; If there is more than one, they won't work right.
  '(ansi-color-faces-vector
     [default default default italic underline success warning error])
 '(evil-cross-lines t)
 '(evil-escape-key-sequence "fd")
 '(evil-want-Y-yank-to-eol nil)
  '(flycheck-protoc-import-path
     (quote
       ("/home/zhiwei/code/arbo/dataworks/" "/home/zhiwei/code/google_protos/")))
 '(golden-ratio-exclude-buffer-names (quote (" *which-key*" "*LV*" " *NeoTree*" "*Ediff*")))
  '(golden-ratio-exclude-modes
     (quote
       ("speedbar-mode" "gdb-memory-mode" "gdb-disassembly-mode" "gdb-inferior-io-mode" "gdb-frames-mode" "gdb-threads-mode" "gdb-breakpoints-mode" "gdb-registers-mode" "gdb-locals-mode" "gud-mode" "dired-mode" "ediff-mode" "calc-mode" "bs-mode")))
 '(golden-ratio-mode t)
  '(helm-projectile-grep-or-ack-actions
     (quote
       ("Find file" helm-grep-action "Find file other frame" helm-grep-other-frame
         (lambda nil
           (and
             (locate-library "elscreen")
             "Find file in Elscreen"))
         helm-grep-jump-elscreen "Save results in grep buffer" helm-grep-save-results "Find file other window" helm-grep-other-window "something" helm-grep-other-window)))
  '(helm-projectile-grep-or-ack-actionsprojectile-grep-or-ack-actions
     (quote
       ("Find file" helm-grep-action "Find file other frame" helm-grep-other-frame
         (lambda nil
           (and
             (locate-library "elscreen")
             "Find file in Elscreen"))
         helm-grep-jump-elscreen "Save results in grep buffer" helm-grep-save-results "Find file other window" helm-grep-other-window "something" helm-grep-other-window)))
 '(js-indent-level 2 t)
 '(js2-basic-offset 2 t)
 '(js2-strict-trailing-comma-warning nil)
 '(line-number-mode nil)
 '(lsp-go-directory-filters ["+go"])
 '(lsp-python-ms-extra-paths ["/home/zhiwei/code/arbo/dataworks/bazel-bin"])
 '(org-agenda-files (quote ("~/org/gtd.org")))
  '(package-selected-packages
     (quote
       (org-projectile org-category-capture org-present org-pomodoro alert log4e gntp org-mime org-download htmlize gnuplot typescript-mode powerline hydra lv projectile groovy-mode flyspell-correct company-ansible anaconda-mode avy tern anzu iedit smartparens evil goto-chg elixir-mode flycheck company request helm helm-core yasnippet multiple-cursors magit-popup magit transient git-commit with-editor async markdown-mode org-plus-contrib pythonic f haml-mode js2-mode simple-httpd dash jedi jedi-core python-environment epc ctable concurrent deferred terraform-mode hcl-mode rvm ruby-tools ruby-test-mode rubocop rspec-mode robe rbenv rake omnisharp shut-up minitest csharp-mode chruby bundler inf-ruby yapfify yaml-mode xterm-color ws-butler winum which-key web-mode web-beautify volatile-highlights vi-tilde-fringe uuidgen use-package toc-org tide tagedit sql-indent spaceline smeargle slim-mode shell-pop scss-mode sass-mode restart-emacs rainbow-mode rainbow-identifiers rainbow-delimiters pyvenv pytest pyenv-mode py-isort pug-mode prettier-js popwin pip-requirements persp-mode pcre2el paradox orgit org-bullets open-junk-file ob-elixir nginx-mode neotree multi-term move-text mmm-mode markdown-toc magit-gitflow macrostep lorem-ipsum livid-mode live-py-mode linum-relative link-hint less-css-mode json-mode js2-refactor js-doc insert-shebang info+ indent-guide hy-mode hungry-delete hl-todo highlight-parentheses highlight-numbers highlight-indentation hide-comnt help-fns+ helm-themes helm-swoop helm-pydoc helm-projectile helm-mode-manager helm-make helm-gitignore helm-flx helm-ext helm-descbinds helm-css-scss helm-company helm-c-yasnippet helm-ag google-translate golden-ratio go-guru go-eldoc gitconfig-mode gitattributes-mode git-timemachine git-messenger git-link git-gutter-fringe git-gutter-fringe+ gh-md fuzzy flyspell-correct-helm flycheck-pos-tip flycheck-mix flycheck-credo flx-ido fish-mode fill-column-indicator fancy-battery eyebrowse expand-region exec-path-from-shell evil-visualstar evil-visual-mark-mode evil-unimpaired evil-tutor evil-surround evil-search-highlight-persist evil-numbers evil-nerd-commenter evil-mc evil-matchit evil-magit evil-lisp-state evil-indent-plus evil-iedit-state evil-exchange evil-escape evil-ediff evil-args evil-anzu eval-sexp-fu eshell-z eshell-prompt-extras esh-help emmet-mode elisp-slime-nav dumb-jump dockerfile-mode disaster diff-hl define-word cython-mode company-web company-tern company-statistics company-shell company-go company-c-headers company-anaconda column-enforce-mode color-identifiers-mode coffee-mode cmake-mode clean-aindent-mode clang-format auto-yasnippet auto-highlight-symbol auto-dictionary auto-compile alchemist aggressive-indent adaptive-wrap ace-window ace-link ace-jump-helm-line ac-ispell ac-etags)))
 '(paradox-github-token t)
  '(projectile-globally-ignored-directories
     (quote
       (".idea" ".ensime_cache" ".eunit" ".git" ".hg" ".fslckout" "_FOSSIL_" ".bzr" "_darcs" ".tox" ".svn" ".stack-work" "venv" "virtualenv" "node_modules"))))
(custom-set-faces
 ;; custom-set-faces was added by Custom.
 ;; If you edit it by hand, you could mess it up, so be careful.
 ;; Your init file should contain only one such instance.
 ;; If there is more than one, they won't work right.
 )
)
