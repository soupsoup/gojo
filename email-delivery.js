function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

function renderEmail({ briefing, profile, hasAudio }) {
  const name = escapeHtml(String(profile.name || "there").split(/\s+/)[0]);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric"
  }).format(new Date());
  const alerts = briefing.sections.map((section) => `
    <tr><td style="padding:20px 0;border-bottom:1px solid #c9c3b6;font:24px/1.25 Georgia,serif;color:#15332c">${escapeHtml(section)}</td></tr>`).join("");
  const sources = briefing.sources.map((source) => `
    <a href="${escapeHtml(source.url)}" style="display:block;color:#15332c;font:11px/1.45 'Courier New',monospace;margin:0 0 8px">${escapeHtml(source.label)} ↗</a>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#ddd8ce;padding:30px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;background:#f4f0e4;border-right:14px solid #d6ef00">
        <tr><td style="background:#15332c;color:#f4f0e4;padding:25px 34px;font:bold 20px Arial,sans-serif">GO<span style="color:#ff4a2f">JO</span><span style="float:right;font:10px 'Courier New',monospace;letter-spacing:2px">MORNING EDITION</span></td></tr>
        <tr><td style="padding:34px">
          <div style="color:#ff4a2f;font:10px 'Courier New',monospace;letter-spacing:2px;text-transform:uppercase">${escapeHtml(date)} · Curated for ${name}</div>
          <h1 style="font:52px/.95 Georgia,serif;letter-spacing:-2px;color:#15332c;margin:24px 0">What changed across your world.</h1>
          ${hasAudio ? `<div style="background:#15332c;color:#f4f0e4;padding:22px 24px;margin:28px 0"><div style="color:#d6ef00;font:10px 'Courier New',monospace;letter-spacing:2px">TODAY'S PRODUCED AUDIO EDITION</div><p style="font:25px/1.15 Georgia,serif;margin:12px 0 0">Attached: your personal GoJo newscast, ready for the road.</p></div>` : ""}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${alerts}</table>
          <div style="margin-top:30px;padding-top:20px;border-top:2px solid #15332c"><div style="color:#ff4a2f;font:10px 'Courier New',monospace;letter-spacing:2px;margin-bottom:14px">DIRECT SOURCES</div>${sources}</div>
        </td></tr>
      </table>
    </td></tr></table></body></html>`;
}

async function sendEdition({ to, profile, briefing, audio }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend is not configured");
  const recipients = Array.isArray(to) ? to : [to];
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(new Date());
  const payload = {
    from: process.env.GOJO_FROM_EMAIL || "GoJo <briefing@updates.gojo.news>",
    to: recipients,
    subject: `Your GoJo for ${date}`,
    html: renderEmail({ briefing, profile, hasAudio: Boolean(audio) }),
    text: briefing.sections.join("\n\n") + "\n\nSources\n" + briefing.sources.map((source) => `${source.label}: ${source.url}`).join("\n"),
    ...(audio ? { attachments: [{ filename: `gojo-${new Date().toISOString().slice(0, 10)}.mp3`, content: audio.toString("base64") }] } : {})
  };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Email delivery failed ${response.status}: ${(await response.text()).slice(0, 400)}`);
  return response.json();
}

module.exports = { renderEmail, sendEdition };
