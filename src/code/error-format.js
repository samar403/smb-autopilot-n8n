// Formats n8n's error-trigger payload into a plain-English alert.
// Execution errors carry `execution`; errors in a trigger itself carry `trigger`.
// @include lib/text.js

const cfg = $('Config').first().json;
return $('When a workflow fails').all().map((item) => {
  const d = item.json;
  const workflowName = d.workflow?.name || 'An SMB Autopilot workflow';
  const exec = d.execution ?? {};
  const err = exec.error ?? d.trigger?.error ?? {};
  const node = exec.lastNodeExecuted || err.node?.name || (d.trigger ? 'its trigger' : 'an unknown step');
  const message = err.message || err.description || 'No error message was recorded.';
  const hint = /credential|auth|401|403|token|expired|invalid_grant/i.test(message)
    ? 'This usually means a connected account (Google, Stripe, Twilio, Anthropic) needs to be reconnected in n8n Credentials.'
    : /429|rate limit/i.test(message)
      ? 'A service rate-limited the request. It normally clears on the next run.'
      : /ENOTFOUND|ECONNRESET|ETIMEDOUT|timeout|503|502/i.test(message)
        ? 'A service was temporarily unreachable. It normally clears on the next run.'
        : 'Open the execution to see the exact step and data that failed.';

  return {
    json: {
      to: cfg.owner_email,
      subject: `Automation problem: "${workflowName}" stopped at ${node}`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827">
<p><b>${escapeHtml(workflowName)}</b> failed at <b>${escapeHtml(node)}</b>.</p>
<p style="background:#f3f4f6;padding:10px;border-radius:6px;font-family:Consolas,monospace;font-size:13px">${escapeHtml(message)}</p>
<p>${escapeHtml(hint)}</p>
${exec.url ? `<p><a href="${escapeHtml(exec.url)}">Open the failed execution</a></p>` : ''}
<p style="color:#6b7280;font-size:12px">Mode: ${escapeHtml(exec.mode || (d.trigger ? 'trigger' : 'unknown'))}${exec.id ? ' · Execution ' + escapeHtml(exec.id) : ''}</p>
</div>`,
    },
  };
});
