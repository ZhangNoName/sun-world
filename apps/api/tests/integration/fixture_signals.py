"""Nested owned-fixture interrupts; pure stdlib, no service discovery or config."""

from contextlib import contextmanager
import signal
import shutil
import tempfile
import threading


class _InterruptState:
    def __init__(self):
        self.interrupted = self.pending = False
        self.depth = 0

    @contextmanager
    def defer(self):
        self.depth += 1
        successful = False
        try:
            yield
            successful = True
        finally:
            self.depth -= 1
            if self.depth == 0 and self.pending:
                self.pending = False
                if successful:
                    raise KeyboardInterrupt
                # An existing cleanup error must not become a successful 130.


@contextmanager
def owned_interrupts():
    signals = (signal.SIGINT, signal.SIGTERM)
    if threading.current_thread() is not threading.main_thread():
        yield _InterruptState()
        return
    previous = {signum: signal.getsignal(signum) for signum in signals}
    inherited = [getattr(handler, '_sun_world_owned_interrupt_state', None)
                 for handler in previous.values()]
    inherited = [state for state in inherited if isinstance(state, _InterruptState)]
    state = inherited[0] if inherited else _InterruptState()
    if any(item is not state for item in inherited):
        raise RuntimeError('OWNED_SIGNAL_STATE_INVALID')

    def interrupted(_signum, _frame):
        if state.interrupted:
            return
        state.interrupted = True
        for signum in signals:
            signal.signal(signum, signal.SIG_IGN)
        if state.depth:
            state.pending = True
        else:
            raise KeyboardInterrupt

    interrupted._sun_world_owned_interrupt_state = state
    try:
        for signum in signals:
            signal.signal(signum, interrupted)
        yield state
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)


@contextmanager
def owned_temporary_directory(state, *, cleanup_confirmed=lambda: True, **options):
    temporary = None
    try:
        with state.defer():
            temporary = tempfile.mkdtemp(**options)
        yield temporary
    finally:
        if temporary is not None:
            with state.defer():
                if not cleanup_confirmed():
                    raise RuntimeError('Owned temporary directory cleanup is unconfirmed')
                shutil.rmtree(temporary)
