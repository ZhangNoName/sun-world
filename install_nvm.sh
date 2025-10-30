#!/usr/bin/env bash

{ # this ensures the entire script is downloaded #

nvm_has() {
  type "$1" > /dev/null 2>&1
}

nvm_install_dir() {
  command printf %s "${NVM_DIR:-"$HOME/.nvm"}"
}

nvm_latest_version() {
  echo "v0.33.11"
}

nvm_profile_is_bash_or_zsh() {
  local TEST_PROFILE
  TEST_PROFILE="${1-}"
  case "${TEST_PROFILE-}" in
    *"/.bashrc" | *"/.bash_profile" | *"/.zshrc")
      return
    ;;
    *)
      return 1
    ;;
  esac
}

#
# Outputs the location to NVM depending on:
# * The availability of $NVM_SOURCE
# * The method used ("script" or "git" in the script, defaults to "git")
# NVM_SOURCE always takes precedence unless the method is "script-nvm-exec"
#
nvm_source() {
  local NVM_METHOD
  NVM_METHOD="$1"
  local NVM_SOURCE_URL
  NVM_SOURCE_URL="$NVM_SOURCE"
  if [ "_$NVM_METHOD" = "_script-nvm-exec" ]; then
    NVM_SOURCE_URL="https://raw.githubusercontent.com/creationix/nvm/$(nvm_latest_version)/nvm-exec"
  elif [ "_$NVM_METHOD" = "_script-nvm-bash-completion" ]; then
    NVM_SOURCE_URL="https://raw.githubusercontent.com/creationix/nvm/$(nvm_latest_version)/bash_completion"
  elif [ -z "$NVM_SOURCE_URL" ]; then
    if [ "_$NVM_METHOD" = "_script" ]; then
      NVM_SOURCE_URL="https://raw.githubusercontent.com/creationix/nvm/$(nvm_latest_version)/nvm.sh"
    elif [ "_$NVM_METHOD" = "_git" ] || [ -z "$NVM_METHOD" ]; then
      NVM_SOURCE_URL="https://github.com/creationix/nvm.git"
    else
      echo >&2 "Unexpected value \"$NVM_METHOD\" for \$NVM_METHOD"
      return 1
    fi
  fi
  echo "$NVM_SOURCE_URL"
}

#
# Node.js version to install
#
nvm_node_version() {
  echo "$NODE_VERSION"
}

nvm_download() {
  if nvm_has "curl"; then
    curl --compressed -q "$@"
  elif nvm_has "wget"; then
    # Emulate curl with wget
    ARGS=$(echo "$*" | command sed -e 's/--progress-bar /--progress=bar /' \
                            -e 's/-L //' \
                            -e 's/--compressed //' \
                            -e 's/-I /--server-response /' \
                            -e 's/-s /-q /' \
                            -e 's/-o /-O /' \
                            -e 's/-C - /-c /')
    # shellcheck disable=SC2086
    eval wget $ARGS
  fi
}

install_nvm_from_git() {
  local INSTALL_DIR
  INSTALL_DIR="$(nvm_install_dir)"

  if [ -d "$INSTALL_DIR/.git" ]; then
    echo "=> nvm is already installed in $INSTALL_DIR, trying to update using git"
    command printf '\r=> '
    command git --git-dir="$INSTALL_DIR"/.git --work-tree="$INSTALL_DIR" fetch origin tag "$(nvm_latest_version)" --depth=1 2> /dev/null || {
      echo >&2 "Failed to update nvm, run 'git fetch' in $INSTALL_DIR yourself."
      exit 1
    }
  else
    # Cloning to $INSTALL_DIR
    echo "=> Downloading nvm from git to '$INSTALL_DIR'"
    command printf '\r=> '
    mkdir -p "${INSTALL_DIR}"
    if [ "$(ls -A "${INSTALL_DIR}")" ]; then
      command git init "${INSTALL_DIR}" || {
        echo >&2 'Failed to initialize nvm repo. Please report this!'
        exit 2
      }
      command git --git-dir="${INSTALL_DIR}/.git" remote add origin "$(nvm_source)" 2> /dev/null \
        || command git --git-dir="${INSTALL_DIR}/.git" remote set-url origin "$(nvm_source)" || {
        echo >&2 'Failed to add remote "origin" (or set the URL). Please report this!'
        exit 2
      }
      command git --git-dir="${INSTALL_DIR}/.git" fetch origin tag "$(nvm_latest_version)" --depth=1 || {
        echo >&2 'Failed to fetch origin with tags. Please report this!'
        exit 2
      }
    else
      command git -c advice.detachedHead=false clone "$(nvm_source)" -b "$(nvm_latest_version)" --depth=1 "${INSTALL_DIR}" || {
        echo >&2 'Failed to clone nvm repo. Please report this!'
        exit 2
      }
    fi
  fi
  command git -c advice.detachedHead=false --git-dir="$INSTALL_DIR"/.git --work-tree="$INSTALL_DIR" checkout -f --quiet "$(nvm_latest_version)"
  if [ ! -z "$(command git --git-dir="$INSTALL_DIR"/.git --work-tree="$INSTALL_DIR" show-ref refs/heads/master)" ]; then
    if command git --git-dir="$INSTALL_DIR"/.git --work-tree="$INSTALL_DIR" branch --quiet 2>/dev/null; then
      command git --git-dir="$INSTALL_DIR"/.git --work-tree="$INSTALL_DIR" branch --quiet -D master >/dev/null 2>&1
    else
      echo >&2 "Your version of git is out of date. Please update it!"
      command git --git-dir="$INSTALL_DIR"/.git --work-tree="$INSTALL_DIR" branch -D master >/dev/null 2>&1
    fi
  fi

  echo "=> Compressing and cleaning up git repository"
  if ! command git --git-dir="$INSTALL_DIR"/.git --work-tree="$INSTALL_DIR" reflog expire --expire=now --all; then
    echo >&2 "Your version of git is out of date. Please update it!"
  fi
  if ! command git --git-dir="$INSTALL_DIR"/.git --work-tree="$INSTALL_DIR" gc --auto --aggressive --prune=now ; then
    echo >&2 "Your version of git is out of date. Please update it!"
  fi
  return
}

#
# Automatically install Node.js
#
nvm_install_node() {
  local NODE_VERSION_LOCAL
  NODE_VERSION_LOCAL="$(nvm_node_version)"

  if [ -z "$NODE_VERSION_LOCAL" ]; then
    return 0
  fi

  echo "=> Installing Node.js version $NODE_VERSION_LOCAL"
  nvm install "$NODE_VERSION_LOCAL"
  local CURRENT_NVM_NODE

  CURRENT_NVM_NODE="$(nvm_version current)"
  if [ "$(nvm_version "$NODE_VERSION_LOCAL")" == "$CURRENT_NVM_NODE" ]; then
    echo "=> Node.js version $NODE_VERSION_LOCAL has been successfully installed"
  else
    echo >&2 "Failed to install Node.js $NODE_VERSION_LOCAL"
  fi
}

install_nvm_as_script() {
  local INSTALL_DIR
  INSTALL_DIR="$(nvm_install_dir)"
  local NVM_SOURCE_LOCAL
  NVM_SOURCE_LOCAL="$(nvm_source script)"
  local NVM_EXEC_SOURCE
  NVM_EXEC_SOURCE="$(nvm_source script-nvm-exec)"
  local NVM_BASH_COMPLETION_SOURCE
  NVM_BASH_COMPLETION_SOURCE="$(nvm_source script-nvm-bash-completion)"

  # Downloading to $INSTALL_DIR
  mkdir -p "$INSTALL_DIR"
  if [ -f "$INSTALL_DIR/nvm.sh" ]; then
    echo "=> nvm is already installed in $INSTALL_DIR, trying to update the script"
  else
    echo "=> Downloading nvm as script to '$INSTALL_DIR'"
  fi
  nvm_download -s "$NVM_SOURCE_LOCAL" -o "$INSTALL_DIR/nvm.sh" || {
    echo >&2 "Failed to download '$NVM_SOURCE_LOCAL'"
    return 1
  } &
  nvm_download -s "$NVM_EXEC_SOURCE" -o "$INSTALL_DIR/nvm-exec" || {
    echo >&2 "Failed to download '$NVM_EXEC_SOURCE'"
    return 2
  } &
  nvm_download -s "$NVM_BASH_COMPLETION_SOURCE" -o "$INSTALL_DIR/bash_completion" || {
    echo >&2 "Failed to download '$NVM_BASH_COMPLETION_SOURCE'"
    return 2
  } &
  for job in $(jobs -p | command sort)
  do
    wait "$job" || return $?
  done
  chmod a+x "$INSTALL_DIR/nvm-exec" || {
    echo >&2 "Failed to mark '$INSTALL_DIR/nvm-exec' as executable"
    return 3
  }
}

nvm_try_profile() {
  if [ -z "${1-}" ] || [ ! -f "${1}" ]; then
    return 1
  fi
  echo "${1}"
}

#
# Detect profile file if not specified as environment variable
# (eg: PROFILE=~/.myprofile)
# The echo'ed path is guaranteed to be an existing file
# Otherwise, an empty string is returned
#
nvm_detect_profile() {
  if [ -n "${PROFILE}" ] && [ -f "${PROFILE}" ]; then
    echo "${PROFILE}"
    return
  fi

  local DETECTED_PROFILE
  DETECTED_PROFILE=''

  if [ -n "${BASH_VERSION-}" ]; then
    if [ -f "$HOME/.bashrc" ]; then
      DETECTED_PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.bash_profile" ]; then
      DETECTED_PROFILE="$HOME/.bash_profile"
    fi
  elif [ -n "${ZSH_VERSION-}" ]; then
    DETECTED_PROFILE="$HOME/.zshrc"
  fi

  if [ -z "$DETECTED_PROFILE" ]; then
    for EACH_PROFILE in ".profile" ".bashrc" ".bash_profile" ".zshrc"
    do
      if DETECTED_PROFILE="$(nvm_try_profile "${HOME}/${EACH_PROFILE}")"; then
        break
      fi
    done
  fi

  if [ ! -z "$DETECTED_PROFILE" ]; then
    echo "$DETECTED_PROFILE"
  fi
}

#
# Check whether the user has any globally-installed npm modules in their system
# Node, and warn them if so.
#
nvm_check_global_modules() {
  command -v npm >/dev/null 2>&1 || return 0

  local NPM_VERSION
  NPM_VERSION="$(npm --version)"
  NPM_VERSION="${NPM_VERSION:--1}"
  [ "${NPM_VERSION%%[!-0-9]*}" -gt 0 ] || return 0

  local NPM_GLOBAL_MODULES
  NPM_GLOBAL_MODULES="$(
    npm list -g --depth=0 |
    command sed -e