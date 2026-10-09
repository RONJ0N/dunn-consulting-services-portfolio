/**
 * Twilio inbound SMS webhook — no longer active.
 *
 * SMS notifications have been replaced by Resend email.  Staff lead-status
 * updates (CONTACTED / TOUR / SIGNED / LOST) must now be made through the
 * admin dashboard at /admin/leads.
 *
 * Returning an empty TwiML 200 response so Twilio stops retrying if the
 * webhook URL hasn't been cleared from the Twilio console yet.
 */
export async function POST() {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } },
  );
}
