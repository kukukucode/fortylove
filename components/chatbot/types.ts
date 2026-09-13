export type ChatbotMode = "preview" | "admin" | "member";

export type ChatbotChoice = {
  id: string;
  label: string;
  title: string;
};

export type ChatbotMessage = {
  role: "user" | "bot";
  text: string;
  source?: string;
  generalTicket?: string;
  offerEscalation?: boolean;
  question?: string;
  decided?: boolean;
  choices?: ChatbotChoice[];
};

export type ChatbotResponse = {
  generalTicket?: string;
  answer?: string;
  source?: string;
  error?: string;
  offerEscalation?: boolean;
  choices?: ChatbotChoice[];
};
