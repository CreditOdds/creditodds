import { Metadata } from "next";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";
import "../static-pages.css";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "CreditOdds Terms of Use",
  openGraph: {
    title: "Terms of Use | CreditOdds",
    description: "CreditOdds Terms of Use",
    url: "https://creditodds.com/terms",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/terms",
  },
};

export default function TermsPage() {
  return (
    <div className="landing-v2 static-v2">
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current">terms</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />updated may 9, 2026</span>
        </div>
      </div>

      <div className="cj-layout">
        <main className="cj-main-static">
          <header className="cj-page-head">
            <div className="cj-page-eyebrow">legal · terms of use</div>
            <h1 className="cj-page-h1">
              Terms of <em className="cj-section-accent">use.</em>
            </h1>
            <p className="cj-page-lede">
              The rules that govern how you use CreditOdds. Be decent, don&apos;t resell
              the data, and we&apos;re not legal advice. The summaries above each section
              are not the contract; the section text is.
            </p>
            <div className="cj-page-meta">
              <span><b>Last updated</b> · May 9, 2026</span>
              <span><b>Governing law</b> · State of Texas</span>
              <span><b>Forum</b> · Harris County, TX</span>
            </div>
          </header>

          <nav className="cj-toc-chips" aria-label="Sections">
            <a href="#acceptance"><span>01</span>acceptance</a>
            <a href="#service"><span>02</span>the service</a>
            <a href="#international"><span>03</span>international use</a>
            <a href="#no-legal-advice"><span>04</span>no legal advice</a>
            <a href="#indemnity"><span>05</span>indemnity</a>
            <a href="#no-resale"><span>06</span>no resale</a>
            <a href="#use-and-storage"><span>07</span>use &amp; storage</a>
            <a href="#termination"><span>08</span>termination</a>
            <a href="#links"><span>09</span>links</a>
            <a href="#ip"><span>10</span>proprietary rights</a>
            <a href="#disclaimers"><span>11</span>disclaimers</a>
            <a href="#liability"><span>12</span>liability</a>
            <a href="#dmca"><span>13</span>copyright (dmca)</a>
            <a href="#general"><span>14</span>general</a>
          </nav>

          <section id="acceptance" className="cj-static-section">
            <div className="cj-section-num">01 · acceptance</div>
            <h2>Acceptance of these terms.</h2>
            <div className="cj-callout"><b>In short:</b> using the site means you&apos;ve read this and agreed.</div>
            <div className="cj-prose">
              <p>
                Welcome to CreditOdds. We provide an Internet service (&quot;Service&quot;).
                Your use of the Service is subject to these Terms of Use (&quot;TOU&quot;).
              </p>
              <p>
                We may modify these TOU at any time without notice to you by posting revised
                TOU on the site. You can review the most current version of the TOU at any
                time at www.CreditOdds.com/terms.
              </p>
              <p>
                Your use of the Service constitutes your binding acceptance of the TOU,
                including any modifications that we make. This Agreement will constitute a
                binding and enforceable agreement between you (individually and in your
                individual capacity as an employee, officer, agent, partner, etc. of each
                organization you represent in connection with any use of the Service) and
                CreditOdds. By using the Service, you acknowledge and agree that you have
                fully read and agree to be bound by the provisions of this Agreement. If you
                do not agree to be bound by this Agreement in its entirety, then you must
                immediately stop using the CreditOdds Website.
              </p>
              <p>
                Where you use the Service in the course of your employment or business, you
                enter into this Agreement both on your own behalf and in your individual
                capacity as an employee, officer, agent, partner, etc. of such organization
                which you represent, and references in this Agreement to &quot;you&quot;
                shall mean both you as the individual user of the Service and you in your
                capacity as a representative of your organization.
              </p>
            </div>
          </section>

          <section id="service" className="cj-static-section">
            <div className="cj-section-num">02 · description of service</div>
            <h2>What the Service is.</h2>
            <div className="cj-callout"><b>In short:</b> content, search, and tools — provided as-is, sometimes with ads.</div>
            <div className="cj-prose">
              <p>
                The Service currently provides users with access to a collection of content,
                including legal information, educational information, Internet search
                services, marketing information, marketing services, hosted Websites and
                business information through its network of properties.
              </p>
              <p>
                You also understand and agree that the Service may include advertisements
                and that these advertisements are necessary for CreditOdds to provide the
                Service. Free Website&apos;s on CreditOdds&apos;s CreditOdds.com service may
                have search functionality provided by a third party service. A search box
                providing this search functionality may be placed anywhere on a Web page,
                including the top of the Web page. Any search that takes place on the
                CreditOdds.com Web site may lead to a search results page on the third
                party site which may include advertisements. This advertising revenue will
                be split between the third party search provider and CreditOdds.
                CreditOdds will also include links on the free CreditOdds.com Websites to
                CreditOdds and other online Websites. These links may be in the header,
                footer, Web Resources Page or Web Blog page. In addition CreditOdds reserves
                the right to place paid advertisements on the CreditOdds.com under the
                footer of the Website&apos;s pages.
              </p>
              <p>
                You also understand and agree that the Service may include certain
                communications from CreditOdds, such as service announcements,
                administrative messages and the CreditOdds Newsletter, and that these
                communications are considered part of CreditOdds membership.
              </p>
              <p>
                Unless explicitly stated otherwise, any new features that augment or enhance
                the current Service, including the release of new CreditOdds properties,
                shall be subject to the TOU.
              </p>
              <p>
                You understand and agree that the Service is provided &quot;AS-IS&quot; and
                that CreditOdds assumes no responsibility for the timeliness, deletion,
                mis-delivery or failure to store any user communications or personalization
                settings. You are responsible for obtaining access to the Service and that
                access may involve third party fees (such as Internet service provider or
                airtime charges). You are responsible for those fees, including those fees
                associated with the display or delivery of advertisements. In addition, you
                must provide and are responsible for all equipment necessary to access the
                Service.
              </p>
              <p>
                We have the right, but not the obligation, to take any of the following
                actions in our sole discretion at any time and for any reason without giving
                you any prior notice:
              </p>
              <ul>
                <li>Restrict, suspend or terminate your access to all or any part of the Service;</li>
                <li>Change, suspend or discontinue all or any part of the Service;</li>
                <li>Refuse, move or remove any material that you submit to the Service for any reason;</li>
                <li>Refuse, move, or remove any content that is available on the Service;</li>
                <li>Deactivate or delete your accounts and all related information and files in your account;</li>
                <li>Establish general practices and limits concerning use of the Service.</li>
              </ul>
              <p>
                You agree that we will not be liable to you or any third party for taking
                any of these actions.
              </p>
            </div>
          </section>

          <section id="international" className="cj-static-section">
            <div className="cj-section-num">03 · international use</div>
            <h2>Special admonitions for international use.</h2>
            <div className="cj-callout"><b>In short:</b> if you&apos;re outside the US, follow your local rules too.</div>
            <div className="cj-prose">
              <p>
                Recognizing the global nature of the Internet, you agree to comply with all
                local rules regarding online conduct and acceptable Content. Specifically,
                you agree to comply with all applicable laws regarding the transmission of
                technical data exported from the United States or the country in which you
                reside.
              </p>
            </div>
          </section>

          <section id="no-legal-advice" className="cj-static-section">
            <div className="cj-section-num">04 · no legal advice</div>
            <h2>This is not legal advice.</h2>
            <div className="cj-callout cj-callout-warn"><b>Important:</b> we&apos;re not lawyers and CreditOdds is not legal counsel.</div>
            <div className="cj-prose">
              <p>
                The Service and all Content are provided for general informational purposes
                only, and may not reflect current legal developments, verdicts or
                settlements. Any information contained in the Content or this Service should
                not be construed as legal advice and is not intended to be a substitute for
                legal counsel on any subject matter. No recipient of Content from the
                Service should act or refrain from acting on the basis of any Content
                included in, or accessible through, the Service without seeking the
                appropriate legal or other professional advice on the particular facts and
                circumstances at issue from a lawyer licensed in the recipient&apos;s state,
                country or other appropriate licensing jurisdiction.
              </p>
            </div>
          </section>

          <section id="indemnity" className="cj-static-section">
            <div className="cj-section-num">05 · indemnity</div>
            <h2>Indemnification.</h2>
            <div className="cj-prose">
              <p>
                You agree to indemnify and hold CreditOdds, and its subsidiaries,
                affiliates, employees, information providers, partners, licensors, agents,
                co-branders, officers, directors, owners and employees, harmless from any
                claim or demand, including reasonable attorneys&apos; fees, made by any
                third party due to or arising out of Content you submit, post, transmit or
                make available through the Service, your use of the Service, your connection
                to the Service, your violation of the TOU, or your violation of any rights
                of another.
              </p>
            </div>
          </section>

          <section id="no-resale" className="cj-static-section">
            <div className="cj-section-num">06 · no resale</div>
            <h2>No resale of the Service.</h2>
            <div className="cj-callout"><b>In short:</b> personal use is fine. Reselling, scraping, or repackaging us is not.</div>
            <div className="cj-prose">
              <p>
                You agree not to reproduce, duplicate, copy, sell, trade, resell or exploit
                for any commercial purposes, any portion of the Service (including your
                CreditOdds Account Identification), use of the Service, or access to the
                Service.
              </p>
            </div>
          </section>

          <section id="use-and-storage" className="cj-static-section">
            <div className="cj-section-num">07 · use &amp; storage</div>
            <h2>Practices regarding use, storage, and changes.</h2>
            <div className="cj-prose">
              <p>
                You acknowledge that CreditOdds may establish general practices and limits
                concerning use of the Service, including without limitation the maximum
                number of days that message board postings or other uploaded Content will be
                retained by the Service, the maximum disk space that will be allotted on
                CreditOdds&apos;s servers on your behalf, and the maximum number of times
                (and the maximum duration for which) you may access the Service in a given
                period of time. You agree that CreditOdds has no responsibility or
                liability for the deletion or failure to store any communications or other
                Content maintained or transmitted by the Service. You acknowledge that
                CreditOdds reserves the right to log off accounts that are inactive for an
                extended period of time. You further acknowledge that CreditOdds reserves
                the right to modify these general practices and limits from time to time.
              </p>
              <p>
                CreditOdds reserves the right at any time and from time to time to modify
                or discontinue, temporarily or permanently, the Service (or any part
                thereof) with or without notice. You agree that CreditOdds shall not be
                liable to you or to any third party for any modification, suspension or
                discontinuance of the Service.
              </p>
            </div>
          </section>

          <section id="termination" className="cj-static-section">
            <div className="cj-section-num">08 · termination</div>
            <h2>Termination.</h2>
            <div className="cj-prose">
              <p>
                You agree that CreditOdds may, under certain circumstances and without
                prior notice, immediately terminate your CreditOdds account and access to
                the Service. Cause for such termination shall include, but not be limited
                to, (a) breaches or violations of the TOU or other incorporated agreements
                or guidelines, (b) requests by law enforcement or other government agencies,
                (c) a request by you (self-initiated account deletions), (d) discontinuance
                or material modification to the Service (or any part thereof), (e)
                unexpected technical or security issues or problems, and (f) extended
                periods of inactivity.
              </p>
              <p>
                Termination of your CreditOdds account includes (a) removal of access to
                all offerings within the Service, including but not limited to CreditOdds
                Message Boards and Websites, (b) deletion of your password and all related
                account information, files and content associated with or inside your
                account (or any part thereof), and (c) barring further use of the Service.
                Further, you agree that all terminations for cause shall be made in
                CreditOdds&apos;s sole discretion and that CreditOdds shall not be liable
                to you or any third-party for any termination of your account, any
                associated email address, or access to the Service.
              </p>
            </div>
          </section>

          <section id="links" className="cj-static-section">
            <div className="cj-section-num">09 · links</div>
            <h2>Links to other sites.</h2>
            <div className="cj-prose">
              <p>
                The Service may provide, or third parties may provide, links to other World
                Wide Websites or resources. Your use of each of those sites is subject to
                the conditions, if any, that each of those sites has posted. Because
                CreditOdds has no control over such sites and resources, you acknowledge and
                agree that CreditOdds is not responsible for the availability of such
                external sites or resources, and does not endorse and is not responsible or
                liable for any Content, advertising, products, or other materials on or
                available from such sites or resources. You further acknowledge and agree
                that CreditOdds shall not be responsible or liable, directly or indirectly,
                for any damage or loss caused or alleged to be caused by or in connection
                with use of or reliance on any such Content, goods or services available on
                or through any such site or resource.
              </p>
            </div>
          </section>

          <section id="ip" className="cj-static-section">
            <div className="cj-section-num">10 · proprietary rights &amp; trademarks</div>
            <h2>Our content, software, and marks.</h2>
            <div className="cj-callout"><b>In short:</b> the site and software are ours; the CreditOdds name and logo are trademarks.</div>
            <div className="cj-prose">
              <p>
                You acknowledge and agree that the Service and any necessary software used
                in connection with the Service (&quot;Software&quot;) contain proprietary
                and confidential information that is protected by applicable intellectual
                property and other laws. You further acknowledge and agree that Content
                contained in sponsor advertisements or information presented to you through
                the Service or advertisers is protected by copyrights, trademarks, service
                marks, patents or other proprietary rights and laws. Except as expressly
                authorized by CreditOdds or advertisers, you agree not to modify, rent,
                lease, loan, sell, distribute or create derivative works based on the
                Service or the Software, in whole or in part.
              </p>
              <p>
                CreditOdds grants you a personal, non-transferable and non-exclusive right
                and license to use the object code of its Software on a single computer;
                provided that you do not (and do not allow any third party to) copy, modify,
                create a derivative work of, reverse engineer, reverse assemble or otherwise
                attempt to discover any source code, sell, assign, sublicense, grant a
                security interest in or otherwise transfer any right in the Software. You
                agree not to modify the Software in any manner or form, or to use modified
                versions of the Software, including (without limitation) for the purpose of
                obtaining unauthorized access to the Service. You agree not to access the
                Service by any means other than through the interface that is provided by
                CreditOdds for use in accessing the Service.
              </p>
              <p>
                CreditOdds claims no copyright in any works of the US Federal Government or
                US State Governments, including court documents, codes, and regulations.
              </p>
              <p>
                CreditOdds and the CreditOdds logo are trademarks of CreditOdds Inc. (the
                &quot;CreditOdds Marks&quot;). Without CreditOdds&apos;s prior permission,
                you agree not to display or use in any manner the CreditOdds Marks.
              </p>
            </div>
          </section>

          <section id="disclaimers" className="cj-static-section">
            <div className="cj-section-num">11 · disclaimers</div>
            <h2>Disclaimer of warranties.</h2>
            <div className="cj-callout cj-callout-warn"><b>Important:</b> the Service is provided &quot;AS IS&quot; and &quot;AS AVAILABLE.&quot; No warranties.</div>
            <div className="cj-prose">
              <p>
                YOU EXPRESSLY UNDERSTAND AND AGREE THAT YOUR USE OF THE SERVICE IS AT YOUR
                SOLE RISK. THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS
                AVAILABLE&quot; BASIS. CREDITODDS EXPRESSLY DISCLAIMS ALL WARRANTIES OF ANY
                KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO THE IMPLIED
                WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, WARRANTIES
                OF TITLE AND NON-INFRINGEMENT.
              </p>
              <p>
                CREDITODDS MAKES NO WARRANTY THAT (i) THE SERVICE WILL MEET YOUR
                REQUIREMENTS, (ii) THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR
                ERROR-FREE, (iii) THE RESULTS THAT MAY BE OBTAINED FROM THE USE OF THE
                SERVICE WILL BE ACCURATE OR RELIABLE, (iv) THE QUALITY OF ANY PRODUCTS,
                SERVICES, INFORMATION, OR OTHER MATERIAL PURCHASED OR OBTAINED BY YOU
                THROUGH THE SERVICE WILL MEET YOUR EXPECTATIONS, AND (V) ANY ERRORS IN THE
                SOFTWARE WILL BE CORRECTED.
              </p>
              <p>
                ANY MATERIAL DOWNLOADED OR OTHERWISE OBTAINED THROUGH THE USE OF THE SERVICE
                IS DONE AT YOUR OWN DISCRETION AND RISK AND THAT YOU WILL BE SOLELY
                RESPONSIBLE FOR ANY DAMAGE TO YOUR COMPUTER SYSTEM OR LOSS OF DATA THAT
                RESULTS FROM THE DOWNLOAD OF ANY SUCH MATERIAL.
              </p>
              <p>
                NO ADVICE OR INFORMATION, WHETHER ORAL OR WRITTEN, OBTAINED BY YOU FROM
                CREDITODDS OR THROUGH OR FROM THE SERVICE SHALL CREATE ANY WARRANTY NOT
                EXPRESSLY STATED IN THE TOU.
              </p>
            </div>
          </section>

          <section id="liability" className="cj-static-section">
            <div className="cj-section-num">12 · liability</div>
            <h2>Limitation of liability.</h2>
            <div className="cj-prose">
              <p>
                YOU EXPRESSLY UNDERSTAND AND AGREE THAT CREDITODDS SHALL NOT BE LIABLE TO
                YOU FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR
                EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO, DAMAGES FOR LOSS OF
                PROFITS, GOODWILL, USE, DATA OR OTHER INTANGIBLE LOSSES (EVEN IF CREDITODDS
                HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES), RESULTING FROM: (i)
                THE USE OR THE INABILITY TO USE THE SERVICE; (ii) THE COST OF PROCUREMENT
                OF SUBSTITUTE GOODS AND SERVICES RESULTING FROM ANY GOODS, DATA, INFORMATION
                OR SERVICES PURCHASED OR OBTAINED OR MESSAGES RECEIVED OR TRANSACTIONS
                ENTERED INTO THROUGH OR FROM THE SERVICE; (iii) UNAUTHORIZED ACCESS TO OR
                ALTERATION OF YOUR TRANSMISSIONS OR DATA; (iv) STATEMENTS OR CONDUCT OF ANY
                THIRD PARTY ON THE SERVICE; OR (v) ANY OTHER MATTER RELATING TO THE SERVICE.
              </p>
              <p>
                SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES OR THE
                LIMITATION OR EXCLUSION OF LIABILITY FOR INCIDENTAL OR CONSEQUENTIAL
                DAMAGES. ACCORDINGLY, SOME OF THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU. IN
                SUCH STATES, OUR LIABILITY AND THAT OF OUR THIRD PARTY CONTENT PROVIDERS AND
                THEIR RESPECTIVE AGENTS SHALL BE LIMITED TO THE GREATEST EXTENT PERMITTED
                BY LAW.
              </p>
              <p>
                <b>Special admonition for legal information.</b> If you intend to create or
                join any service, receive or request any news, messages, alerts or other
                information from the Service concerning legal information or services,
                please read the disclaimers and liability sections again — they go doubly
                for you. The Service is provided for informational purposes only, and no
                Content included in the Service should be relied on as a substitution for
                the legal advice from a licensed lawyer. CreditOdds, its licensors and
                partners shall not be responsible or liable for the accuracy, usefulness or
                availability of any information transmitted or made available via the
                Service, and shall not be responsible or liable for any trading or
                investment decisions made based on such information.
              </p>
              <p>
                <b>No third party beneficiaries.</b> You agree that, except as otherwise
                expressly provided in this TOU, there shall be no third party beneficiaries
                to this Agreement.
              </p>
              <p>
                <b>Notice.</b> CreditOdds may provide you with notices, including those
                regarding changes to the TOU, by either email, regular mail, or postings on
                the Service.
              </p>
            </div>
          </section>

          <section id="dmca" className="cj-static-section">
            <div className="cj-section-num">13 · copyright (DMCA)</div>
            <h2>Notice and procedure for IP claims.</h2>
            <div className="cj-callout"><b>In short:</b> we respect IP. If your work was infringed, here&apos;s how to tell us.</div>
            <div className="cj-prose">
              <p>
                CreditOdds respects the intellectual property of others, and we ask our
                users to do the same. CreditOdds may, in appropriate circumstances and at
                its discretion, disable and/or terminate the accounts of users who may be
                repeat infringers. If you believe that your work has been copied in a way
                that constitutes copyright infringement, or your intellectual property
                rights have been otherwise violated, please provide CreditOdds&apos;s
                Copyright Agent the following information:
              </p>
              <ul>
                <li>An electronic or physical signature of the person authorized to act on behalf of the owner of the copyright or other intellectual property interest;</li>
                <li>A description of the copyrighted work or other intellectual property that you claim has been infringed;</li>
                <li>A description of where the material that you claim is infringing is located on the site;</li>
                <li>Your address, telephone number, and email address;</li>
                <li>A statement by you that you have a good faith belief that the disputed use is not authorized by the copyright owner, its agent, or the law;</li>
                <li>A statement by you, made under penalty of perjury, that the above information in your Notice is accurate and that you are the copyright or intellectual property owner or authorized to act on the copyright or intellectual property owner&apos;s behalf.</li>
              </ul>
            </div>
            <dl className="cj-deflist">
              <dt>Agent for notice</dt>
              <dd>
                CreditOdds<br />
                3262 Westheimer Road, No. 222<br />
                Houston, Texas 77098
              </dd>
            </dl>
          </section>

          <section id="general" className="cj-static-section">
            <div className="cj-section-num">14 · general</div>
            <h2>General information.</h2>
            <div className="cj-prose">
              <p>
                <b>Entire Agreement.</b> The TOU constitutes the entire agreement between
                you and CreditOdds and govern your use of the Service, superseding any
                prior agreements between you and CreditOdds. You also may be subject to
                additional terms and conditions that may apply when you use or purchase
                certain other CreditOdds services, affiliate services, third-party content
                or third-party software.
              </p>
            </div>
            <dl className="cj-deflist">
              <dt>Choice of law &amp; forum</dt>
              <dd>
                Governed by the laws of the State of Texas without regard to its
                conflict-of-law provisions. You and CreditOdds agree to submit to the
                personal and exclusive jurisdiction of the courts located in Harris County,
                Texas.
              </dd>
              <dt>Arbitration</dt>
              <dd>
                CreditOdds may elect to resolve any controversy or claim arising out of or
                relating to these TOU or our sites by binding arbitration in accordance with
                the commercial arbitration rules of the American Arbitration Association.
                Any such controversy or claim shall be arbitrated on an individual basis,
                and shall not be consolidated in any arbitration with any claim or
                controversy of any other party. The arbitration shall be conducted in the
                county of Harris, Texas, and judgment on the arbitration award may be
                entered in any court having jurisdiction thereof.
              </dd>
              <dt>Waiver &amp; severability</dt>
              <dd>
                The failure of CreditOdds to exercise or enforce any right or provision of
                the TOU shall not constitute a waiver of such right or provision. If any
                provision of the TOU is found by a court of competent jurisdiction to be
                invalid, the parties nevertheless agree that the court should endeavor to
                give effect to the parties&apos; intentions as reflected in the provision,
                and the other provisions of the TOU remain in full force and effect.
              </dd>
              <dt>Non-transferability</dt>
              <dd>
                Your CreditOdds account is non-transferable and any rights to your
                CreditOdds I.D. or contents within your account terminate upon your death.
                Upon receipt of a copy of a death certificate, your account may be
                terminated and all contents therein permanently deleted.
              </dd>
              <dt>Statute of limitations</dt>
              <dd>
                Regardless of any statute or law to the contrary, any claim or cause of
                action arising out of or related to use of the Service or the TOU must be
                filed within one (1) year after such claim or cause of action arose or be
                forever barred.
              </dd>
              <dt>Titles</dt>
              <dd>The section titles in the TOU are for convenience only and have no legal or contractual effect.</dd>
              <dt>Violations</dt>
              <dd>Please report any violations of the TOU to our Terms of Service Group via the contact page.</dd>
            </dl>
          </section>
        </main>
      </div>

      <V2Footer />
    </div>
  );
}
