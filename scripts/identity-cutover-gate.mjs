#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const FULL_SCHEMA_MODE = 'full'
export const IDENTITY_SCHEMA_MODE = 'identity-20260829'
export const REQUIRED_IDENTITY_SCHEMA_ACK = '20260829_identity_schema'
export const REQUIRED_IDENTITY_MAINTENANCE_ACK =
  'STOP_CURRENT_API_FOR_IDENTITY_CUTOVER'
export const REQUIRED_IDENTITY_TIMER_ACK =
  'AUTO_DEPLOY_TIMER_STOPPED_FOR_IDENTITY_CUTOVER'
export const REVIEWED_SHA_PATTERN = /^[0-9a-f]{40}$/
export const MAIN_REF = 'refs/heads/main'

function isTrue(value) {
  return value === true || value === 'true'
}

export function isCommitImageTag(imageTag) {
  return REVIEWED_SHA_PATTERN.test(imageTag || '')
}

export function validateIdentityCutoverGate({
  eventName,
  ref,
  workflowSha,
  deploymentMode,
  schemaMode,
  apiChanged,
  deployNeeded,
  imageTag,
  allowedSha,
  schemaAck,
  maintenanceAck,
  timerAck,
}) {
  if (schemaMode === FULL_SCHEMA_MODE) return []

  const errors = []
  if (schemaMode !== IDENTITY_SCHEMA_MODE) {
    return [`unsupported schema_mode: ${schemaMode || '(empty)'}`]
  }
  if (eventName !== 'workflow_dispatch') {
    errors.push('identity-20260829 is available only to workflow_dispatch')
  }
  if (ref !== MAIN_REF) {
    errors.push('identity-20260829 is available only from refs/heads/main')
  }
  if (workflowSha !== allowedSha) {
    errors.push(
      'identity-20260829 requires the workflow SHA to match IDENTITY_CUTOVER_ALLOWED_SHA'
    )
  }
  if (deploymentMode !== 'deploy-existing') {
    errors.push('identity-20260829 requires mode=deploy-existing')
  }
  if (!isTrue(apiChanged)) {
    errors.push('identity-20260829 requires target=api or target=all')
  }
  if (!isTrue(deployNeeded)) {
    errors.push(
      'identity-20260829 requires an actual deploy; build-only is not allowed'
    )
  }
  if (!isCommitImageTag(allowedSha)) {
    errors.push(
      'IDENTITY_CUTOVER_ALLOWED_SHA must be a non-empty 40-character lowercase SHA'
    )
  } else if (imageTag !== allowedSha) {
    errors.push(
      'IDENTITY_CUTOVER_ALLOWED_SHA must exactly match the selected image_tag'
    )
  }
  if (schemaAck !== REQUIRED_IDENTITY_SCHEMA_ACK) {
    errors.push(
      'identity_schema_ack must exactly confirm the reviewed identity migration'
    )
  }
  if (maintenanceAck !== REQUIRED_IDENTITY_MAINTENANCE_ACK) {
    errors.push(
      'identity_maintenance_ack must exactly confirm the current API maintenance window'
    )
  }
  if (timerAck !== REQUIRED_IDENTITY_TIMER_ACK) {
    errors.push(
      'identity_timer_ack must exactly confirm the frontend auto-deploy timer is stopped'
    )
  }
  return errors
}

export function shouldStageIdentityCutoverPush({
  eventName,
  ref,
  apiChanged,
  imageTag,
  allowedSha,
}) {
  return (
    eventName === 'push' &&
    ref === MAIN_REF &&
    isTrue(apiChanged) &&
    isCommitImageTag(allowedSha) &&
    imageTag === allowedSha
  )
}

function runValidation(argv) {
  if (argv.length !== 12) {
    console.error(
      'Identity cutover gate requires event, ref, workflow SHA, deployment mode, schema mode, API flag, deploy flag, image tag, allowed SHA, schema acknowledgement, maintenance acknowledgement, and timer acknowledgement.'
    )
    return 2
  }
  const [
    eventName,
    ref,
    workflowSha,
    deploymentMode,
    schemaMode,
    apiChanged,
    deployNeeded,
    imageTag,
    allowedSha,
    schemaAck,
    maintenanceAck,
    timerAck,
  ] = argv
  const errors = validateIdentityCutoverGate({
    eventName,
    ref,
    workflowSha,
    deploymentMode,
    schemaMode,
    apiChanged,
    deployNeeded,
    imageTag,
    allowedSha,
    schemaAck,
    maintenanceAck,
    timerAck,
  })
  if (errors.length) {
    console.error('Identity cutover gate failed:')
    for (const error of errors) console.error(`- ${error}`)
    return 1
  }
  console.log(
    schemaMode === IDENTITY_SCHEMA_MODE
      ? 'Identity cutover gate passed for the reviewed image tag.'
      : 'Schema gate passed in full mode.'
  )
  return 0
}

function runPushStageCheck(argv) {
  if (argv.length !== 5) {
    console.error(
      'Identity push-stage check requires event, ref, API flag, image tag, and allowed SHA.'
    )
    return 2
  }
  const [eventName, ref, apiChanged, imageTag, allowedSha] = argv
  console.log(
    shouldStageIdentityCutoverPush({
      eventName,
      ref,
      apiChanged,
      imageTag,
      allowedSha,
    })
      ? 'true'
      : 'false'
  )
  return 0
}

function runImageTagValidation(argv) {
  if (argv.length !== 1) {
    console.error('Image tag validation requires exactly one value.')
    return 2
  }
  if (!isCommitImageTag(argv[0])) {
    console.error('image_tag must be a 40-character lowercase commit SHA.')
    return 1
  }
  console.log('Image tag validation passed.')
  return 0
}

export function runIdentityCutoverGate(argv) {
  const [command, ...values] = argv
  if (command === 'validate') return runValidation(values)
  if (command === 'should-stage-push') return runPushStageCheck(values)
  if (command === 'validate-image-tag') return runImageTagValidation(values)
  console.error(
    'Identity cutover gate command must be validate, should-stage-push, or validate-image-tag.'
  )
  return 2
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) process.exit(runIdentityCutoverGate(process.argv.slice(2)))
