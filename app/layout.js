export const metadata = { title: 'Zauni – Login' };

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body style={{fontFamily:'Inter, system-ui, Arial', background:'#f6f4ef', color:'#222', margin:0}}>
        {children}
      </body>
    </html>
  );
}
