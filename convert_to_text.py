# ---------------- FINANCIAL DATASET ----------------
import pandas as pd
import os


financial_folder = "Dataset/Financial"

documents = []

# Loop through all financial csv files
for file in os.listdir(financial_folder):

    if file.endswith(".csv"):

        path = os.path.join(financial_folder, file)

        df = pd.read_csv(path)

        for index, row in df.iterrows():

            text = f"""
            Company Data from {file}.
            Sector: {row.get('Sector', 'Unknown')}.
            Price: {row.get('Price', 'Unknown')}.
            Market Cap: {row.get('Market Cap', 'Unknown')}.
            Dividend Yield: {row.get('Dividend Yield', 'Unknown')}.
            Earnings Per Share: {row.get('EPS', 'Unknown')}.
            """

            documents.append(text)

# Save financial documents
with open("processed_data/financial_text.txt", "w", encoding="utf-8") as f:
    for doc in documents:
        f.write(doc + "\n")

print("Financial dataset conversion complete!")
print("Total financial records:", len(documents))