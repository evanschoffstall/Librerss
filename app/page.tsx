import Image from "next/image";

export default function Home() {
  return (
    <main className="m-10">
      <div className="m-5">
        <p className="text-4xl font-bold">LibreRSS</p>

        <h2 className="text-2xl text-left py-2">
          A revival of extant tradition of free cloud RSS
        </h2>
        <h3 className="text-xl text-left py-4">Features:</h3>
        <h4 className="text-lg text-left py-2">- Free</h4>
        <h4 className="text-lg text-left py-2">- Modern</h4>
        <h4 className="text-lg text-left py-2">- Cloud Service</h4>
        <h4 className="text-lg text-left py-2">- Reader</h4>
        <h4 className="text-lg text-left py-2">- No Ads</h4>
        <h4 className="text-lg text-left py-2">- Open Source</h4>
      </div>
    </main>
  );
}
