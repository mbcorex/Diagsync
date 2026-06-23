import assert from "node:assert/strict";
import { ReviewStatus } from "@prisma/client";
import {
  canUseControlledEdit,
  nextVersionNumber,
  requireEditReason,
  shouldResetApproval,
} from "./edit-system-core";

function testPermissions() {
  assert.equal(canUseControlledEdit("MD"), true);
  assert.equal(canUseControlledEdit("SUPER_ADMIN"), true);
  assert.equal(canUseControlledEdit("HRM"), true);
}

function testReasonValidation() {
  assert.equal(requireEditReason("Corrected typo"), true);
  assert.equal(requireEditReason(" "), false);
  assert.equal(requireEditReason(undefined), false);
}

function testVersionIncrement() {
  assert.equal(nextVersionNumber([]), 1);
  assert.equal(nextVersionNumber([1]), 2);
  assert.equal(nextVersionNumber([1, 2, 5]), 6);
}

function testApprovalResetRule() {
  assert.equal(shouldResetApproval(ReviewStatus.APPROVED), true);
  assert.equal(shouldResetApproval(ReviewStatus.PENDING), false);
  assert.equal(shouldResetApproval(ReviewStatus.REJECTED), false);
  assert.equal(shouldResetApproval(null), false);
}

function run() {
  testPermissions();
  testReasonValidation();
  testVersionIncrement();
  testApprovalResetRule();
  console.log("edit-system-core tests passed");
}

run();

