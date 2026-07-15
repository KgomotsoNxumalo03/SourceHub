import { firestoreAdmin } from "../lib/db.ts";

const employees = [
  ["SH-1001", "Lerato", "Mokoena", "lerato.mokoena@example.com", "Service Desk Analyst", "IT Operations", "+27 11 555 0101"],
  ["SH-1002", "Thabo", "Dlamini", "thabo.dlamini@example.com", "Senior Support Technician", "IT Operations", "+27 11 555 0102"],
  ["SH-1003", "Naledi", "Maseko", "naledi.maseko@example.com", "People Operations Manager", "Human Resources", "+27 11 555 0103"],
  ["SH-1004", "Sipho", "Khumalo", "sipho.khumalo@example.com", "Network Engineer", "Infrastructure", "+27 11 555 0104"],
  ["SH-1005", "Ayanda", "Ndlovu", "ayanda.ndlovu@example.com", "Finance Administrator", "Finance", "+27 11 555 0105"],
  ["SH-1006", "Kagiso", "Molefe", "kagiso.molefe@example.com", "Cloud Engineer", "Infrastructure", "+27 11 555 0106"],
  ["SH-1007", "Zanele", "Nkosi", "zanele.nkosi@example.com", "Customer Success Lead", "Customer Success", "+27 11 555 0107"],
  ["SH-1008", "Bongani", "Zulu", "bongani.zulu@example.com", "Security Analyst", "Information Security", "+27 11 555 0108"],
  ["SH-1009", "Refilwe", "Modise", "refilwe.modise@example.com", "Procurement Officer", "Operations", "+27 11 555 0109"],
  ["SH-1010", "Mpho", "Mahlangu", "mpho.mahlangu@example.com", "Application Developer", "Engineering", "+27 11 555 0110"],
  ["SH-1011", "Nokuthula", "Sithole", "nokuthula.sithole@example.com", "Quality Assurance Analyst", "Engineering", "+27 11 555 0111"],
  ["SH-1012", "Tshepo", "Mabena", "tshepo.mabena@example.com", "Facilities Coordinator", "Operations", "+27 11 555 0112"],
  ["SH-1013", "Karabo", "Radebe", "karabo.radebe@example.com", "Business Analyst", "Product", "+27 11 555 0113"],
  ["SH-1014", "Siyabonga", "Cele", "siyabonga.cele@example.com", "Service Delivery Manager", "Customer Success", "+27 11 555 0114"],
  ["SH-1015", "Palesa", "Motsoeneng", "palesa.motsoeneng@example.com", "Marketing Coordinator", "Marketing", "+27 11 555 0115"],
];

const now = new Date();
const batch = firestoreAdmin.batch();

for (const [employeeNumber, firstName, lastName, email, jobTitle, department, phone] of employees) {
  batch.set(
    firestoreAdmin.collection("employees").doc(employeeNumber),
    {
      employeeNumber,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      email,
      jobTitle,
      department,
      phone,
      status: "ACTIVE",
      isSeedData: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
}

await batch.commit();
const count = (await firestoreAdmin.collection("employees").get()).size;
console.log(`Seeded ${employees.length} fictional employees; Firestore now contains ${count} employee records.`);
