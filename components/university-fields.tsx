"use client";

import { useEffect, useState } from "react";
import { parseRegistrationDraft, REGISTRATION_DRAFT_KEY } from "@/lib/registration-draft";
import { visibleDepartment } from "@/lib/profile";

const schools: Record<string, Record<string, string[]>> = {
  "早稲田大学": {
    "政治経済学部": ["政治学科", "経済学科", "国際政治経済学科"],
    "法学部": [],
    "文化構想学部": [],
    "文学部": [],
    "教育学部": ["教育学科", "国語国文学科", "英語英文学科", "社会科", "理学科", "数学科", "複合文化学科"],
    "商学部": [],
    "基幹理工学部": ["学系Ⅰ（学系別入試）", "学系Ⅱ（学系別入試）", "学系Ⅲ（学系別入試）", "学系Ⅳ（学系別入試）", "数学科", "応用数理学科", "機械科学・航空宇宙学科", "電子物理システム学科", "情報理工学科", "情報通信学科", "表現工学科"],
    "創造理工学部": ["建築学科", "総合機械工学科", "経営システム工学科", "社会環境工学科", "環境資源工学科"],
    "先進理工学部": ["物理学科", "応用物理学科", "化学・生命化学科", "応用化学科", "生命医科学科", "電気・情報生命工学科"],
    "社会科学部": ["社会科学科"],
    "人間科学部": ["人間環境科学科", "健康福祉科学科", "人間情報科学科"],
    "スポーツ科学部": ["スポーツ科学科"],
    "国際教養学部": ["国際教養学科"],
  },
  "日本女子大学": {
    "家政学部": ["児童学科", "被服学科", "家政経済学科"],
    "文学部": ["日本文学科", "英文学科", "史学科"],
    "人間社会学部": ["現代社会学科", "社会福祉学科", "教育学科", "心理学科"],
    "理学部": ["数物情報科学科", "化学生命科学科"],
    "国際文化学部": ["国際文化学科"],
    "建築デザイン学部": ["建築デザイン学科"],
    "食科学部": ["食科学科", "栄養学科"],
  },
  "東京女子大学": {
    "現代教養学部": ["人文学科", "国際社会学科", "経済経営学科", "心理学科", "社会コミュニケーション学科", "情報数理科学科"],
  },
};

export function UniversityFields({
  initialUniversity = "",
  initialFaculty = "",
  initialDepartment = "",
  restoreDraft = true,
}: {
  initialUniversity?: string;
  initialFaculty?: string;
  initialDepartment?: string;
  restoreDraft?: boolean;
}) {
  const [university, setUniversity] = useState(initialUniversity);
  const [faculty, setFaculty] = useState(initialFaculty);
  const [department, setDepartment] = useState(visibleDepartment(initialDepartment));

  useEffect(() => {
    if (!restoreDraft) return;
    const saved = sessionStorage.getItem(REGISTRATION_DRAFT_KEY);
    if (!saved) return;
    const values = parseRegistrationDraft(saved);
    setUniversity(values.university_choice ?? "");
    setFaculty(values.faculty_choice ?? "");
    setDepartment(visibleDepartment(values.department_choice));
  }, [restoreDraft]);

  const faculties = university ? schools[university] ?? {} : {};
  const departments = faculty ? faculties[faculty] ?? [] : [];
  const hasDepartmentChoice = departments.length > 0;

  return <>
    <label>大学
      <select name="university_choice" value={university} onChange={(event) => {
        setUniversity(event.target.value); setFaculty(""); setDepartment("");
      }} required>
        <option value="">選択してください</option>
        {Object.keys(schools).map((name) => <option key={name}>{name}</option>)}
      </select>
    </label>
    <input type="hidden" name="university" value={university} />

    {university && <label>学部
      <select name="faculty_choice" value={faculty} onChange={(event) => {
        const nextFaculty = event.target.value;
        setFaculty(nextFaculty);
        setDepartment("");
      }} required>
        <option value="">選択してください</option>
        {Object.keys(faculties).map((name) => <option key={name}>{name}</option>)}
      </select>
    </label>}
    <input type="hidden" name="faculty" value={faculty} />

    {faculty && hasDepartmentChoice && <label>学科・学系
      <select name="department_choice" value={department} onChange={(event) => setDepartment(event.target.value)} required>
        <option value="">選択してください</option>
        {departments.map((name) => <option key={name}>{name}</option>)}
      </select>
    </label>}
    <input type="hidden" name="department" value={hasDepartmentChoice ? department : ""} />
  </>;
}
