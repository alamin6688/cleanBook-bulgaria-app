import prisma from "../../../lib/prisma";
import ApiError from "../../../errors/apiError";
import emailSender from "../../../helpers/email_sender/emailSender";
import config from "../../../config";
import httpStatus from "http-status";

interface IContactUsInput {
  fullName: string;
  phoneNumber: string;
  email: string;
  description: string;
}

const submitContactUs = async (userId: string, data: IContactUsInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  // Build a nicely formatted HTML email to send to the support team
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #1a2e23ff; padding: 24px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0;">📬 New Support Request</h2>
        <p style="color: #a0a0b0; margin: 8px 0 0;">CleanBook Bulgaria — Contact Form</p>
      </div>
      <div style="padding: 32px; background-color: #fafafa;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; font-weight: bold; width: 130px;">Full Name:</td>
            <td style="padding: 8px 0; color: #333;">${data.fullName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-weight: bold;">Phone Number:</td>
            <td style="padding: 8px 0; color: #333;">${data.phoneNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-weight: bold;">Email Address:</td>
            <td style="padding: 8px 0; color: #333;">${data.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-weight: bold;">User Role:</td>
            <td style="padding: 8px 0; color: #333;">${user.role}</td>
          </tr>
        </table>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
        <h4 style="color: #444; margin: 0 0 12px;">Description:</h4>
        <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; color: #333; line-height: 1.6;">
          ${data.description.replace(/\n/g, "<br/>")}
        </div>
      </div>
      <div style="background-color: #f0f0f0; padding: 16px; text-align: center;">
        <p style="color: #888; font-size: 12px; margin: 0;">This email was sent from the CleanBook App.</p>
      </div>
    </div>
  `;

  // Send email to the support/admin inbox
  const supportInbox = config.emailSender.email;
  await emailSender(`[Support Request] From ${data.fullName}`, supportInbox, html);

  return { message: "Your message has been sent. We will get back to you shortly." };
};

export const ContactService = {
  submitContactUs,
};
