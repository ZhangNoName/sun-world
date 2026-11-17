"""Strict projection of controller-owned API restart observations, no task data."""

FIELDS = frozenset(('cut', 'passed', 'api_sigkill_confirmed', 'worker_survived', 'restart_ready',
    'idempotency_preserved', 'budget_preserved', 'history_preserved', 'old_callback_rejected',
    'deadline_reconciled', 'redis_lease_retained', 'completed_quiescent_before_kill',
    'callback_lease_remaining_ms', 'terminal_elapsed_ms', 'budget_mode', 'model_count_before',
    'model_count_after', 'cleanup_confirmed', 'failure_stage', 'error_type', 'child_failure',
    'worker_start_count', 'worker_acknowledged', 'linux_observation'))
KERNEL = frozenset(('crashed', 'executions', 'maximum_memory_peak_bytes', 'model_requests',
    'tool_calls', 'parent_cgroup_reaped', 'parent_recovery_positive_control',
    'sdk_group_already_gone_before_parent', 'relays_closed'))
COMMON = ('passed', 'api_sigkill_confirmed', 'worker_survived', 'restart_ready',
    'idempotency_preserved', 'budget_preserved', 'history_preserved', 'cleanup_confirmed',
    'worker_acknowledged')


def fail():
    raise ValueError('AGENT_LINUX_API_PROCESS_PROOF_FAILED') from None


def number(value, low, high):
    return type(value) is int and low <= value <= high


def verify(report):
    if (type(report) is not dict or set(report) != {'version', 'passed', 'platform', 'linux_verified', 'cases'}
            or report['version'] != 'sun-world-api-process-recovery/1'
            or report['passed'] is not True or report['linux_verified'] is not True
            or report['platform'] != 'linux-cgroup-bubblewrap'
            or type(report['cases']) is not list or len(report['cases']) != 3):
        fail()
    peaks = []
    for index, (row, cut, models, tools, starts) in enumerate(zip(report['cases'],
            ('accepted', 'model_hold', 'completed'), (0, 1, 3), (0, 0, 2), (0, 1, 1))):
        if (type(row) is not dict or set(row) != FIELDS or row['cut'] != cut
                or any(row[key] is not True for key in COMMON)
                or any(row[key] is not None for key in ('failure_stage', 'error_type', 'child_failure'))
                or row['budget_mode'] != 'synthetic-reservation-only'
                or any(not number(row[key], models, models) for key in ('model_count_before', 'model_count_after'))
                or not number(row['worker_start_count'], starts, starts)
                or row['old_callback_rejected'] is not (True if index == 1 else None)
                or row['completed_quiescent_before_kill'] is not (True if index == 2 else None)
                or any(row[key] is not (None if index == 2 else True)
                       for key in ('deadline_reconciled', 'redis_lease_retained'))):
            fail()
        if index == 1:
            if not number(row['callback_lease_remaining_ms'], 1, 10000):
                fail()
        elif row['callback_lease_remaining_ms'] is not None:
            fail()
        if index == 2:
            if row['terminal_elapsed_ms'] is not None:
                fail()
        elif not number(row['terminal_elapsed_ms'], 45000 if index == 0 else 10000, 60000 if index == 0 else 45000):
            fail()
        kernel = row['linux_observation']
        if (type(kernel) is not dict or set(kernel) != KERNEL
                or any(kernel[key] is not False for key in ('crashed', 'parent_cgroup_reaped', 'parent_recovery_positive_control'))
                or kernel['relays_closed'] is not True or kernel['sdk_group_already_gone_before_parent'] is not True
                or not number(kernel['executions'], starts, starts)
                or not number(kernel['model_requests'], models, models)
                or not number(kernel['tool_calls'], tools, tools)
                or not number(kernel['maximum_memory_peak_bytes'], 1 if starts else 0, 536870912 if starts else 0)):
            fail()
        peaks.append(kernel['maximum_memory_peak_bytes'])
    return {'version': 'sun-world-linux-api-process-crosscheck/1', 'cases': 3,
        'api_sigkills': 3, 'sdk_executions': 2, 'synthetic_model_requests': 4, 'tool_calls': 2,
        'worker_acks': 3, 'old_callback_rejected_with_valid_lease': True,
        'original_deadlines_observed': True, 'budget_history_idempotency_preserved': True,
        'relays_cgroups_workspaces_removed': True, 'memory_max_bytes': 536870912, 'pids_max': 64,
        'maximum_memory_peak_bytes': max(peaks), 'supplier_requests': 0}
