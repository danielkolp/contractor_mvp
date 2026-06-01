// Euroflo dashboard — fake seed data
window.EF_DATA = {
  user: { name: "Marco", company: "Tidewater Renovations", initials: "MT" },

  // Today queue
  needsAction: [
    { id: "n1", kind: "invoice", status: "overdue", icon: "file-text", name: "North Ridge Homes",
      ref: "INV-1048", amount: 4850, note: "Invoice", tag: "7d overdue",
      draft: "Hi Sam, quick follow-up on invoice INV-1048 for $4,850. The work at North Ridge wrapped up two weeks back — happy to resend the invoice if it's easier. Thanks again for the project." },
    { id: "n2", kind: "estimate", status: "due", icon: "clipboard-list", name: "Harbor View HOA",
      ref: "EST-2211", amount: 8300, note: "Estimate · follow-up due", tag: "due today",
      draft: "Hi Dana, just checking in on the estimate (EST-2211) we sent for the exterior work — $8,300. No rush at all, just want to make sure it landed and answer any questions." },
    { id: "n3", kind: "invoice", status: "overdue", icon: "file-text", name: "Mason & Co.",
      ref: "INV-1031", amount: 12600, note: "Invoice", tag: "21d overdue",
      draft: "Hi Joel, following up on INV-1031 ($12,600) from the Mason & Co. job. Let me know if there's anything you need from me to get this wrapped up. Appreciate it." },
  ],
  messageReady: [
    { id: "m1", kind: "recovery", status: "followup", icon: "rotate-ccw", name: "Cedar Park Dental",
      ref: "Repeat work", amount: 6200, note: "Win-back · message ready", tag: "ready to send",
      draft: "Hi Priya, it's been about a year since we did the reception remodel — wanted to check in before the busy season. If you've got any projects on the list for this year, I'd love to take a look." },
    { id: "m2", kind: "recovery", status: "followup", icon: "rotate-ccw", name: "Lakeside Cafe",
      ref: "EST-2188", amount: 3400, note: "Quiet estimate · message ready", tag: "ready to send",
      draft: "Hi Tom, circling back on the patio estimate (EST-2188, $3,400). Happy to adjust the scope if budget's the holdup — just say the word." },
  ],
  waiting: [
    { id: "w1", kind: "recovery", status: "waiting", icon: "rotate-ccw", name: "Glenwood Property Mgmt",
      ref: "INV-1019", amount: 5200, note: "Follow-up sent · check back May 28", tag: "waiting" },
    { id: "w2", kind: "recovery", status: "waiting", icon: "rotate-ccw", name: "Birch & Vine Bakery",
      ref: "EST-2150", amount: 2100, note: "Follow-up sent · check back Jun 02", tag: "waiting" },
  ],

  invoices: [
    { ref: "INV-1048", client: "North Ridge Homes", amount: 4850, due: "May 17", status: "overdue", tag: "Overdue" },
    { ref: "INV-1031", client: "Mason & Co.", amount: 12600, due: "May 03", status: "overdue", tag: "Overdue" },
    { ref: "INV-1052", client: "Cedar Park Dental", amount: 6200, due: "Jun 04", status: "due", tag: "Due soon" },
    { ref: "INV-1019", client: "Glenwood Property Mgmt", amount: 5200, due: "May 24", status: "waiting", tag: "Follow-up sent" },
    { ref: "INV-1044", client: "Summit Builders", amount: 9100, due: "May 30", status: "paid", tag: "Paid" },
    { ref: "INV-1040", client: "Oakdale Schools", amount: 15400, due: "May 12", status: "paid", tag: "Paid" },
  ],
  estimates: [
    { ref: "EST-2211", client: "Harbor View HOA", amount: 8300, sent: "May 18", status: "due", tag: "Follow-up due" },
    { ref: "EST-2188", client: "Lakeside Cafe", amount: 3400, sent: "May 09", status: "followup", tag: "No reply" },
    { ref: "EST-2150", client: "Birch & Vine Bakery", amount: 2100, sent: "May 02", status: "waiting", tag: "Follow-up sent" },
    { ref: "EST-2205", client: "Summit Builders", amount: 11800, sent: "May 20", status: "accepted", tag: "Accepted" },
    { ref: "EST-2199", client: "Riverside Clinic", amount: 7600, sent: "May 15", status: "draft", tag: "Draft" },
  ],
  clients: [
    { name: "North Ridge Homes", contact: "Sam Whitfield", trade: "Renovation", jobs: 4, reliability: "good", outstanding: 4850 },
    { name: "Mason & Co.", contact: "Joel Mason", trade: "Commercial", jobs: 7, reliability: "watch", outstanding: 12600 },
    { name: "Cedar Park Dental", contact: "Priya Nadar", trade: "Fit-out", jobs: 2, reliability: "good", outstanding: 0 },
    { name: "Harbor View HOA", contact: "Dana Cole", trade: "Exterior", jobs: 3, reliability: "good", outstanding: 0 },
    { name: "Summit Builders", contact: "Erik Sandoval", trade: "Framing", jobs: 11, reliability: "great", outstanding: 0 },
    { name: "Glenwood Property Mgmt", contact: "Lena Park", trade: "Maintenance", jobs: 5, reliability: "watch", outstanding: 5200 },
  ],
  jobRequests: [
    { name: "Aisha Rahman", trade: "Kitchen remodel", when: "2h ago", desc: "Looking to redo our kitchen — cabinets, counters, and flooring. Roughly 180 sq ft.", phone: "(604) 555-0148", isNew: true },
    { name: "Devon Clarke", trade: "Deck build", when: "Yesterday", desc: "Need a new cedar deck off the back, about 12×16. Have a rough sketch ready to share.", phone: "(604) 555-0192", isNew: true },
    { name: "The Okafor Family", trade: "Bathroom", when: "2 days ago", desc: "Main bathroom is dated — tub, vanity, tile. Open to ideas on layout.", phone: "(604) 555-0173", isNew: true },
  ],
};
