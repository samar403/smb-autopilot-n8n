export const slug = '00-error-alerts';

export default function build({ createBuilder, code, assignments }) {
  const b = createBuilder(slug);

  b.sticky(`## Error alerts
Emails you in plain English whenever another SMB Autopilot workflow fails, with a link to the failed run.

**Setup (3 min)**
1. Set **owner_email** in Config and connect Gmail.
2. Save this workflow (it does not need to be activated).
3. In each other workflow: **Settings → Error workflow → SMB Autopilot · Error alerts**.`, [-460, 120], { width: 400, height: 300, color: 4 });

  b.node('When a workflow fails', 'errorTrigger', 1, {}, [0, 300]);

  b.node('Config', 'set', 3.4, {
    assignments: assignments(slug, 'Config', [['owner_email', 'you@example.com']]),
    options: {},
  }, [220, 300]);

  b.node('Format alert', 'code', 2, { jsCode: code('error-format.js') }, [440, 300]);

  b.node('Email the owner', 'gmail', 2.1, {
    sendTo: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailType: 'html',
    message: '={{ $json.html }}',
    options: { appendAttribution: false, senderName: 'SMB Autopilot' },
  }, [660, 300]);

  b.chain('When a workflow fails', 'Config', 'Format alert', 'Email the owner');

  return b.workflow('SMB Autopilot · Error alerts', {
    description: 'Plain-English email alert when any SMB Autopilot workflow fails.',
  });
}
