export function listTransactions() {
  return [
    {
      id: "INV001",
      paymentStatus: "Paid",
      totalAmount: "$250.00",
      paymentDetails: "Sent to Josimar",
    },
    {
      id: "INV002",
      paymentStatus: "Pending",
      totalAmount: "$150.00",
      paymentDetails: "Sent to Gabriel",
    },
    {
      id: "INV003",
      paymentStatus: "Unpaid",
      totalAmount: "$350.00",
      paymentDetails: "Sent to Ana",
    },
    {
      id: "INV004",
      paymentStatus: "Paid",
      totalAmount: "$450.00",
      paymentDetails: "Received from Stone Ltda.",
    },
    {
      id: "INV005",
      paymentStatus: "Paid",
      totalAmount: "$550.00",
      paymentDetails: "Received from Wise",
    },
    {
      id: "INV006",
      paymentStatus: "Pending",
      totalAmount: "$200.00",
      paymentDetails: "Bank Transfer",
    },
    {
      id: "INV007",
      paymentStatus: "Unpaid",
      totalAmount: "$300.00",
      paymentDetails: "Credit Card",
    },
  ];
}