import React, { useEffect } from "react";

const Privacy = () => {

    useEffect(()=> {
        document.title = `Privacy | CreditOdds`;
    })
    return(
        <div className="relative py-16 bg-white overflow-hidden">
            <div className="hidden lg:block lg:absolute lg:inset-y-0 lg:h-full lg:w-full">
                <div className="relative h-full text-lg max-w-prose mx-auto" aria-hidden="true">
                <svg className="absolute top-12 left-full transform translate-x-32" width="404" height="384" fill="none" viewBox="0 0 404 384">
                    <defs>
                    <pattern id="74b3fd99-0a6f-4271-bef2-e80eeafdf357" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                        <rect x="0" y="0" width="4" height="4" className="text-gray-200" fill="currentColor" />
                    </pattern>
                    </defs>
                    <rect width="404" height="384" fill="url(#74b3fd99-0a6f-4271-bef2-e80eeafdf357)" />
                </svg>
                <svg className="absolute top-1/2 right-full transform -translate-y-1/2 -translate-x-32" width="404" height="384" fill="none" viewBox="0 0 404 384">
                    <defs>
                    <pattern id="f210dbf6-a58d-4871-961e-36d5016a0f49" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                                    <rect x="0" y="0" width="4" height="4" className="text-gray-200" fill="currentColor" />
                    </pattern>
                    </defs>
                    <rect width="404" height="384" fill="url(#f210dbf6-a58d-4871-961e-36d5016a0f49)" />
                </svg>
                <svg className="absolute bottom-12 left-full transform translate-x-32" width="404" height="384" fill="none" viewBox="0 0 404 384">
                <defs>
                    <pattern id="d3eb07ae-5182-43e6-857d-35c643af9034" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                    <rect x="0" y="0" width="4" height="4" className="text-gray-200" fill="currentColor" />
                    </pattern>
                </defs>
                    <rect width="404" height="384" fill="url(#d3eb07ae-5182-43e6-857d-35c643af9034)" />
                    </svg>
                </div>
                </div>
            <div className="relative px-4 sm:px-6 lg:px-8">
            <div className="text-lg max-w-screen-lg mx-auto">
            <h1>
            <span className="block text-base text-center text-indigo-600 font-semibold tracking-wide uppercase">Privacy</span>
            <span className="mt-2 block text-3xl text-center leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">Use of Private Information Policy</span>
            </h1>
            <ul className="list-disc list-inside mt-8 text-base text-gray-500 leading-8 ">
                <li><b>Summary -</b> We respect the EU’s General Data Protection Regulations (GDPR) and this policy explains how we collect and treat any information you give us. You won’t find any complicated legal terms or long passages of unreadable text.  We’ve no desire to trick you into agreeing to something you might later regret.</li>
                <li><b>Why we value your privacy -</b> We value your privacy as much as we do our own, so we’re committed to keeping your personal and business information safe.  We’re uncomfortable with the information companies, governments, and other organisations keep on file, so we ask for only the bare minimum from our customers.  We’ll never use your personal information for any reason other than why you gave it, and we’ll never give anyone access to it unless we’re forced to by law.</li>
                <li><b>How we collect information -</b> Our website doesn’t use cookies or scripts that were designed to track the websites you visit.  We don’t use analytics or native social media ‘like’ or ‘sharing’ buttons which also build profiles of your internet activity.</li>
                <li><b>What information we hold -</b> When you contact us by email or through our website, we collect your name, email address, if you’ve given us that, and your IP address if you conduct a search (this allows us to block a denial of service attack).</li>
                <li><b>Where we store your information -</b> When you contact us by email or through our website, we store your information on our secure cloud database.  </li>
                <li><b>Who’s responsible for your information at our company -</b> Our IT Department is responsible for the security of your information.  You can contact them by using the contact feature if you have any concerns about the information we store.</li>
                <li><b>Who has access to information about you -</b> When we store information in our own systems, only the people who need it have access.  Our management team has access to everything you’ve provided.</li>
                <li><b>The steps we take to keep your information private -</b> Where we store your information in third-party services, we restrict access only to people who need it.</li>
                <li><b>How to complain -</b> We take complaints very seriously. If you’ve any reason to complain about the ways we handle your privacy, please contact us through the contact feature.</li>
                <li><b>Changes to the policy -</b> If we change the contents of this policy, those changes will become effective the moment we publish them on our website.</li>  
                </ul>
            <br></br>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-gray-100 text-gray-800">
                Updated 4/8/21
            </span>
            </div>
            </div>
        </div>
    )
}
export default Privacy;